package reportentitlementusagemetric

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	entitlementUsageSchema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// InstanceEntitlementUsageReportAccepted is the outbox payload for both
// ENTITLEMENT_USAGE_REPORT_ACCEPTED and ENTITLEMENT_USAGE_REPORT_REJECTED;
// Status says which. A rejected report is not persisted, so Value and
// Behavior describe what was asked for, not what was stored.
type InstanceEntitlementUsageReportAccepted struct {
	EntitlementSlug string                   `json:"entitlement_slug" doc:"URL-friendly identifier of the entitlement the usage was reported against"`
	Value           float64                  `json:"value" doc:"Value carried by the report"`
	Behavior        Behavior                 `json:"behavior" enum:"append,set" doc:"Report behavior: append folds the value into the stored total, set overwrites it"`
	EventCount      int32                    `json:"event_count" doc:"Number of reports folded into the current usage window, including this one"`
	Status          events.UsageReportStatus `json:"status" enum:"ACCEPTED,REJECTED" doc:"Whether the report was persisted"`
}

// InstanceEntitlementCapExceeded is the outbox payload for
// INSTANCE_ENTITLEMENT_CAP_EXCEEDED.
type InstanceEntitlementCapExceeded struct {
	EntitlementSlug string  `json:"entitlement_slug" doc:"URL-friendly identifier of the entitlement"`
	Threshold       float64 `json:"threshold" doc:"The entitlement cap"`
	Value           float64 `json:"value" doc:"Current usage value, including overage"`
	Overage         float64 `json:"overage" doc:"Amount by which usage exceeds the cap"`
}

// InstanceEntitlementUsageWarningThresholdReached is the outbox payload for
// INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED.
type InstanceEntitlementUsageWarningThresholdReached struct {
	EntitlementSlug string  `json:"entitlement_slug" doc:"URL-friendly identifier of the entitlement"`
	Threshold       float64 `json:"threshold" doc:"The entitlement cap"`
	Boundary        float64 `json:"boundary" doc:"Usage value at which the warning fires (cap * warningThresholdPercent / 100)"`
	Value           float64 `json:"value" doc:"Current usage value"`
}

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	UsageReporter services.UsageReporter
	Uof           *uow.UnitOfWork
	// MaxRolloverClosures caps how many usage windows one report may close
	// (KAITEN_USAGE_ROLLOVER_MAX_CLOSURES). Zero or less means
	// DefaultMaxRolloverClosures.
	MaxRolloverClosures int
	// IdempotencyWindow is how long a transactionId is remembered
	// (KAITEN_USAGE_IDEMPOTENCY_WINDOW). Zero or less means
	// DefaultIdempotencyWindow.
	IdempotencyWindow time.Duration
}

// DefaultIdempotencyWindow is 35 days: reports are dated on receipt, so a
// buffered report replayed late (an agent flushing after reconnecting, a batch
// re-sent after an incident) must be recognized across a whole monthly period
// plus margin.
const DefaultIdempotencyWindow = 35 * 24 * time.Hour

// idempotencyLookahead bounds the key lookup above the report's instant: a
// key accepted "in the future" only exists if the clock stepped back, and the
// bound keeps the scan off the empty partitions ahead.
const idempotencyLookahead = 24 * time.Hour

// Result is what a report answers with, and whether it is the replay of an
// earlier report sent under the same transactionId (Idempotent-Replayed).
type Result struct {
	Usage    *entitlementUsageSchema.EntitlementUsage
	Replayed bool
	// MetadataDropped is the Kaiten-Metadata-Dropped value when the report's
	// metadata was not stored, "" otherwise. A replay never carries it.
	MetadataDropped string
}

const usageReportMeter = "kaiten.usage.report"

type UseCase struct {
	deps                Deps
	queryRepo           *QueryRepository
	commandRepo         *CommandRepository
	outbox              *outbox.ScopedRepository
	maxRolloverClosures int
	idempotencyWindow   time.Duration
	rolloverCapExceeded metric.Int64Counter
	ledgerUnavailable   metric.Int64Counter
	idempotentReplays   metric.Int64Counter
	idempotencyConflict metric.Int64Counter
	metadataDropped     metric.Int64Counter
	duration            metric.Float64Histogram
}

func NewUseCase(deps Deps) *UseCase {
	maxRolloverClosures := deps.MaxRolloverClosures
	if maxRolloverClosures <= 0 {
		maxRolloverClosures = DefaultMaxRolloverClosures
	}
	idempotencyWindow := deps.IdempotencyWindow
	if idempotencyWindow <= 0 {
		idempotencyWindow = DefaultIdempotencyWindow
	}

	meter := otel.GetMeterProvider().Meter(usageReportMeter)
	rolloverCapExceeded, err := meter.Int64Counter(
		"kaiten.usage.report.rollover_cap_exceeded",
		metric.WithDescription("Usage reports refused because closing the windows since the last report would exceed the rollover cap"),
		metric.WithUnit("{report}"),
	)
	if err != nil {
		slog.Warn("failed to register usage report metric", "metric", "rollover_cap_exceeded", "error", err)
	}
	idempotentReplays, err := meter.Int64Counter(
		"kaiten.usage.report.idempotent_replays",
		metric.WithDescription("Usage reports answered as the replay of an earlier report with the same transactionId"),
		metric.WithUnit("{report}"),
	)
	if err != nil {
		slog.Warn("failed to register usage report metric", "metric", "idempotent_replays", "error", err)
	}
	idempotencyConflict, err := meter.Int64Counter(
		"kaiten.usage.report.idempotency_conflicts",
		metric.WithDescription("Usage reports refused because their transactionId was already used for another report: a client bug"),
		metric.WithUnit("{report}"),
	)
	if err != nil {
		slog.Warn("failed to register usage report metric", "metric", "idempotency_conflicts", "error", err)
	}
	metadataDropped, err := meter.Int64Counter(
		"kaiten.usage.report.metadata_dropped",
		metric.WithDescription("Usage reports counted without their metadata, by reason (too_large: above 4 KiB)"),
		metric.WithUnit("{report}"),
	)
	if err != nil {
		slog.Warn("failed to register usage report metric", "metric", "metadata_dropped", "error", err)
	}
	duration, err := meter.Float64Histogram(
		"kaiten.usage.report.duration",
		metric.WithDescription("A usage report's transaction, from its first read to its commit, by outcome (accepted, rejected, replayed, conflict, error)"),
		metric.WithUnit("s"),
		metric.WithExplicitBucketBoundaries(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
	)
	if err != nil {
		slog.Warn("failed to register usage report metric", "metric", "duration", "error", err)
	}
	ledgerUnavailable, err := meter.Int64Counter(
		"kaiten.usage.ledger.unavailable",
		metric.WithDescription("Usage reports refused because no usage_ledger partition covers the instant they were accepted at"),
		metric.WithUnit("{report}"),
	)
	if err != nil {
		slog.Warn("failed to register usage report metric", "metric", "ledger.unavailable", "error", err)
	}

	return &UseCase{
		deps:                deps,
		queryRepo:           NewQueryRepository(deps.Uof),
		commandRepo:         NewCommandRepository(deps.Uof),
		outbox:              outbox.NewScopedRepository(deps.Uof),
		maxRolloverClosures: maxRolloverClosures,
		idempotencyWindow:   idempotencyWindow,
		rolloverCapExceeded: rolloverCapExceeded,
		ledgerUnavailable:   ledgerUnavailable,
		idempotentReplays:   idempotentReplays,
		idempotencyConflict: idempotencyConflict,
		metadataDropped:     metadataDropped,
		duration:            duration,
	}
}

func (h *UseCase) Execute(ctx context.Context, instanceSlug, entitlementSlug string, command *Command) (*Result, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.EntitlementValuesReportedEntitlementSlug)

	// Encoded before the transaction: it depends on nothing stored, and is
	// only written if the report is accepted.
	properties, metadataTooLarge, err := encodeMetadata(command.Metadata)
	if err != nil {
		return nil, err
	}

	var result *entitlementUsageSchema.EntitlementUsage
	var thresholdExceeded, replayed, reused bool

	started := time.Now()
	defer func() {
		if h.duration == nil {
			return
		}
		outcome := "accepted"
		switch {
		case replayed:
			outcome = "replayed"
		case thresholdExceeded:
			outcome = "rejected"
		case reused:
			outcome = "conflict"
		case err != nil:
			outcome = "error"
		}
		h.duration.Record(ctx, time.Since(started).Seconds(), metric.WithAttributes(attribute.String("outcome", outcome)))
	}()

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		entitlementUsageCtx, err := h.queryRepo.GetEntitlementUsageContext(
			ctx,
			instanceSlug,
			entitlementSlug,
			user.OrganizationID,
		)
		if err != nil {
			return err
		}

		if entitlementUsageCtx.EntitlementType != db.EntitlementTypeNUMBER && entitlementUsageCtx.EntitlementType != db.EntitlementTypeNUMBERAICREDIT {
			return kaitenerrors.Validation(
				"ReportEntitlementUsageMetric.UnsupportedEntitlementType",
				"report usage is only supported for NUMBER and NUMBER_AI_CREDIT entitlements",
			)
		}

		// The instant this report happens at, read by GetEntitlementUsageContext
		// once it held the pair's lock.
		reportedAt := entitlementUsageCtx.ReportedAt

		// A transactionId this pair already accepted within the horizon:
		// answer what that report got, or refuse a different report under the
		// same key. Either way nothing is written -- no counter, no rollover,
		// no event, no row -- and the lookup runs under the pair's lock, so two
		// identical requests in flight apply once and replay once. A REJECTED
		// report wrote no row, so its key was never consumed.
		if command.TransactionID != nil {
			original, err := h.queryRepo.FindReportByTransactionID(
				ctx, user.OrganizationID, entitlementUsageCtx.InstanceID, entitlementUsageCtx.EntitlementID,
				*command.TransactionID, command.Value,
				reportedAt.Add(-h.idempotencyWindow), reportedAt.Add(idempotencyLookahead),
			)
			if err != nil {
				return err
			}
			if original != nil {
				if original.Behavior != command.Behavior || !original.SameValue {
					h.idempotencyConflict.Add(ctx, 1)
					reused = true
					slog.WarnContext(ctx, "usage report refused: transactionId reused for another report",
						"organization_id", user.OrganizationID,
						"instance_id", entitlementUsageCtx.InstanceID,
						"entitlement_id", entitlementUsageCtx.EntitlementID,
						"original_report_seq", original.ReportSeq,
					)
					return kaitenerrors.ConflictWithErrors(
						"ReportEntitlementUsageMetric.TransactionIdReused",
						fmt.Sprintf("transactionId %q was already used for another report of %s; send a correction under a new key", *command.TransactionID, entitlementSlug),
						&kaitenerrors.ErrorDetail{
							Message:  "the report this transactionId was first accepted with",
							Location: "body.transactionId",
							Value: map[string]any{
								"reportSeq":  original.ReportSeq,
								"reportedAt": original.ReportedAt,
								"behavior":   original.Behavior,
								"value":      json.Number(original.ReportedValue),
							},
						},
					)
				}
				h.idempotentReplays.Add(ctx, 1)
				result = original.response(entitlementUsageCtx.EntitlementID, entitlementUsageCtx.EntitlementSlug)
				replayed = true
				return nil
			}
		}

		aggregationMethod := resolveAggregationMethod(entitlementUsageCtx.AggregationMethod)

		currentUsage := entitlementvalue.NewDefaultNumberUsageValue()
		if entitlementUsageCtx.UsageValue != nil {
			currentUsage, err = entitlementvalue.ParseNumberUsageValue(entitlementUsageCtx.UsageValue)
			if err != nil {
				return kaitenerrors.Validation("ReportEntitlementUsageMetric.InvalidStoredUsageValue", err.Error())
			}
		}

		threshold, err := entitlementvalue.ParseNumberThreshold(entitlementUsageCtx.EffectiveValue)
		if err != nil {
			return kaitenerrors.Validation("ReportEntitlementUsageMetric.InvalidLicenseEntitlementValue", err.Error())
		}

		// Periodic usage windows. ResetPeriod == nil means a lifetime
		// counter, preserving pre-existing behavior exactly: no window
		// computation, currentUsage stays whatever was parsed above, and
		// resolvedPeriodStart/End stay nil (legacy NULL period_start), which is
		// also the documented "lifetime entitlement" reading of the
		// currentPeriodStart/End response fields.
		var resolvedPeriodStart, resolvedPeriodEnd *time.Time
		if entitlementUsageCtx.ResetPeriod != nil {
			// A stored window ahead of the computed one stays current (see
			// period.ResolveCurrent): the counter keeps counting where it is
			// instead of rolling over from a window that is already ahead.
			window, storedAhead, err := period.ResolveCurrent(
				reportedAt, entitlementUsageCtx.PeriodStart,
				*entitlementUsageCtx.ResetPeriod, *entitlementUsageCtx.ResetAnchor, entitlementUsageCtx.LicenseStart,
			)
			if err != nil {
				return err
			}
			if storedAhead {
				slog.WarnContext(ctx, "usage window ahead of the database clock, kept as current",
					"instance_id", entitlementUsageCtx.InstanceID,
					"entitlement_id", entitlementUsageCtx.EntitlementID,
					"stored_period_start", window.Start,
					"reported_at", reportedAt,
				)
			}

			hasStoredRow := entitlementUsageCtx.UsageValue != nil
			stale := hasStoredRow && (entitlementUsageCtx.PeriodStart == nil || !entitlementUsageCtx.PeriodStart.Equal(window.Start))

			if stale {
				closures, err := planRollover(
					ctx, h.maxRolloverClosures,
					entitlementUsageCtx.PeriodStart, currentUsage.Value, currentUsage.EventCount,
					window, *entitlementUsageCtx.ResetPeriod, *entitlementUsageCtx.ResetAnchor, entitlementUsageCtx.LicenseStart,
				)
				if errors.Is(err, errRolloverLimitExceeded) {
					h.rolloverCapExceeded.Add(ctx, 1)
					slog.ErrorContext(ctx, "usage report refused: too many windows to roll over",
						"instance_id", entitlementUsageCtx.InstanceID,
						"entitlement_id", entitlementUsageCtx.EntitlementID,
						"stored_period_start", entitlementUsageCtx.PeriodStart,
						"max_closures", h.maxRolloverClosures,
					)
					return kaitenerrors.Internal(
						"ReportEntitlementUsageMetric.RolloverLimitExceeded",
						fmt.Sprintf("closing the usage windows elapsed since the last report of %s would exceed the limit of %d", entitlementSlug, h.maxRolloverClosures),
					)
				}
				if err != nil {
					return err
				}

				// Persist the rollover -- reset to {0,0} at the current window --
				// independently of whatever the incoming report below decides.
				// Exceeding the maximum allowed usage rejects the report write,
				// not period-maintenance state that has already legitimately
				// advanced; otherwise the same rollover could be emitted again
				// on the next report.
				resetUsage := entitlementvalue.NewDefaultNumberUsageValue()
				resetBytes, err := entitlementvalue.ToBytes(resetUsage)
				if err != nil {
					return err
				}
				if err := h.commandRepo.ReportEntitlementUsage(
					ctx, entitlementUsageCtx.InstanceID, entitlementUsageCtx.EntitlementID, resetBytes, user.OrganizationID, &window.Start,
				); err != nil {
					return err
				}

				// One round trip via CreateOutboxEvents regardless of how many
				// windows were skipped: a dormant HOUR/DAY entitlement can
				// legitimately produce thousands of closures in a single
				// report (up to maxRolloverClosures), and inserting them one at
				// a time would hold the advisory lock and this transaction
				// open far longer than necessary.
				rolloverEventsToEmit := make([]outbox.Outbox, len(closures))
				for i, c := range closures {
					payload := InstanceEntitlementUsagePeriodRolledOver{
						EntitlementID:     entitlementUsageCtx.EntitlementID,
						EntitlementSlug:   entitlementSlug,
						InstanceID:        entitlementUsageCtx.InstanceID,
						Value:             c.Value,
						EventCount:        c.EventCount,
						ClosedPeriodStart: c.ClosedPeriodStart,
						ClosedPeriodEnd:   c.ClosedPeriodEnd,
						NewPeriodStart:    c.NewPeriodStart,
						IsSynthetic:       c.IsSynthetic,
					}
					rolloverEventsToEmit[i] = outbox.NewOutboxMessage(
						user.OrganizationID,
						events.InstanceEntitlementUsagePeriodRolledOver.Name,
						events.InstanceEntitlementUsagePeriodRolledOver.Type,
						payload,
						outbox.AuditHeaders{InstanceID: &entitlementUsageCtx.InstanceID},
					).At(reportedAt)
				}
				if err := h.outbox.CreateOutboxEvents(ctx, rolloverEventsToEmit); err != nil {
					return err
				}

				// USAGE_REACHED naturally rearms and cap-crossing detection starts
				// fresh: currentUsage below is now the reset {0,0} value, so the
				// crossing checks further down see the new window's own history,
				// not the closed window's.
				currentUsage = resetUsage
			}

			resolvedPeriodStart = &window.Start
			resolvedPeriodEnd = &window.End
		}

		updatedUsage, err := computeUpdatedUsage(command, currentUsage, aggregationMethod)
		if err != nil {
			return err
		}

		// Enforcement is fully derived from threshold and
		// LimitCapExceededOveragePercent -- no separate hard/soft/unlimited flag.
		// A hard limit (percent 0) makes maximumAllowedUsage equal threshold, so
		// one comparison covers both the cap check and the bounded overage check.
		unlimited := entitlementvalue.IsUnlimitedThreshold(threshold)
		exceedsCap := !unlimited && updatedUsage.Value > threshold
		reachedCapExactly := !unlimited && updatedUsage.Value == threshold
		exceedsMaximumAllowedUsage := !unlimited && updatedUsage.Value > entitlementvalue.MaximumAllowedUsage(threshold, entitlementUsageCtx.LimitCapExceededOveragePercent)

		if exceedsMaximumAllowedUsage {
			event := outbox.NewOutboxMessage(
				user.OrganizationID,
				events.EntitlementUsageReportRejected.Name,
				events.EntitlementUsageReportRejected.Type,
				InstanceEntitlementUsageReportAccepted{
					EntitlementSlug: entitlementSlug,
					Value:           command.Value,
					Behavior:        command.Behavior,
					EventCount:      updatedUsage.EventCount,
					Status:          events.UsageReportStatusRejected,
				},
				outbox.AuditHeaders{InstanceID: &entitlementUsageCtx.InstanceID},
			).At(reportedAt)
			if err := h.outbox.CreateOutboxEvent(ctx, event); err != nil {
				return err
			}
			// Return nil to commit the outbox event; usage is NOT written.
			thresholdExceeded = true
			return nil
		}

		// From here the report is accepted: within the cap, or a soft limit
		// admitting an overage within its bound. Usage is always persisted,
		// overage included, and journalled: the counter moves the pair's
		// report_seq forward and the usage_ledger row records this report
		// under it, in this transaction and under this lock, so the journal
		// explains the counter row for row.
		updatedUsageBytes, err := entitlementvalue.ToBytes(updatedUsage)
		if err != nil {
			return err
		}

		reportSeq, err := h.commandRepo.AcceptEntitlementUsage(
			ctx,
			entitlementUsageCtx.InstanceID,
			entitlementUsageCtx.EntitlementID,
			updatedUsageBytes,
			user.OrganizationID,
			resolvedPeriodStart,
		)
		if err != nil {
			return err
		}

		if err := h.commandRepo.AppendUsageLedger(ctx, LedgerEntry{
			OrganizationID:    user.OrganizationID,
			InstanceID:        entitlementUsageCtx.InstanceID,
			EntitlementID:     entitlementUsageCtx.EntitlementID,
			LicenseID:         entitlementUsageCtx.LicenseID,
			ReportSeq:         reportSeq,
			ReportedAt:        reportedAt,
			WindowStart:       resolvedPeriodStart,
			WindowEnd:         resolvedPeriodEnd,
			Behavior:          command.Behavior,
			AggregationMethod: aggregationMethod,
			ReportedValue:     command.Value,
			ValueBefore:       currentUsage.Value,
			ValueAfter:        updatedUsage.Value,
			EventCountAfter:   updatedUsage.EventCount,
			Threshold:         threshold,
			OveragePercent:    entitlementUsageCtx.LimitCapExceededOveragePercent,
			TransactionID:     command.TransactionID,
			Properties:        properties,
		}); err != nil {
			if kaitenerrors.IsMissingPartition(err, usageLedgerTable) {
				// No partition covers reportedAt. Partitions are created a year
				// ahead, so this is a defect to page on, never a normal state:
				// the report is refused and nothing is written, which keeps
				// the counter and the journal in step. A retry is safe once a
				// partition exists.
				h.ledgerUnavailable.Add(ctx, 1)
				slog.ErrorContext(ctx, "usage report refused: no usage_ledger partition for its instant",
					"reported_at", reportedAt,
					"instance_id", entitlementUsageCtx.InstanceID,
					"entitlement_id", entitlementUsageCtx.EntitlementID,
				)
				return kaitenerrors.Unavailable(
					"ReportEntitlementUsageMetric.LedgerUnavailable",
					"the usage journal cannot record a report at this instant; nothing was counted, retry later",
				)
			}
			return err
		}

		acceptedEvent := outbox.NewOutboxMessage(
			user.OrganizationID,
			events.EntitlementUsageReportAccepted.Name,
			events.EntitlementUsageReportAccepted.Type,
			InstanceEntitlementUsageReportAccepted{
				EntitlementSlug: entitlementSlug,
				Value:           command.Value,
				Behavior:        command.Behavior,
				EventCount:      updatedUsage.EventCount,
				Status:          events.UsageReportStatusAccepted,
			},
			outbox.AuditHeaders{InstanceID: &entitlementUsageCtx.InstanceID},
		).At(reportedAt)
		if err := h.outbox.CreateOutboxEvent(ctx, acceptedEvent); err != nil {
			return err
		}

		// Build response in-memory: we already know the updated value, the window
		// resolved above and all remaining fields from the context query — no
		// extra round-trip needed.
		licenseSlug := ""
		if entitlementUsageCtx.LicenseSlug != nil {
			licenseSlug = *entitlementUsageCtx.LicenseSlug
		}
		limit, err := entitlementUsageSchema.ParseEntitlementValue(entitlementUsageCtx.EffectiveValue)
		if err != nil {
			return err
		}
		result = &entitlementUsageSchema.EntitlementUsage{
			EntitlementID:   entitlementUsageCtx.EntitlementID,
			EntitlementSlug: entitlementUsageCtx.EntitlementSlug,
			LicenseID:       entitlementUsageCtx.LicenseID,
			LicenseSlug:     licenseSlug,
			Value: entitlementUsageSchema.EntitlementValue{
				Number: &entitlementUsageSchema.NumberEntitlementValue{
					Type:       "number",
					Value:      updatedUsage.Value,
					EventCount: updatedUsage.EventCount,
				},
			},
			Limit:              limit,
			CurrentPeriodStart: resolvedPeriodStart,
			CurrentPeriodEnd:   resolvedPeriodEnd,
		}

		if reachedCapExactly {
			event := outbox.NewOutboxMessage(
				user.OrganizationID,
				events.InstanceEntitlementUsageReached.Name,
				events.InstanceEntitlementUsageReached.Type,
				result,
				outbox.AuditHeaders{InstanceID: &entitlementUsageCtx.InstanceID},
			).At(reportedAt)
			if err := h.outbox.CreateOutboxEvent(ctx, event); err != nil {
				return err
			}
		} else if exceedsCap && entitlementvalue.Crossed(currentUsage.Value, updatedUsage.Value, threshold) {
			// The report was accepted despite exceeding the base cap -- a soft
			// limit admitting an overage within its bound. Fire the crossing
			// signal only the first time usage passes the cap, not on every
			// subsequent over-cap report.
			event := outbox.NewOutboxMessage(
				user.OrganizationID,
				events.InstanceEntitlementCapExceeded.Name,
				events.InstanceEntitlementCapExceeded.Type,
				InstanceEntitlementCapExceeded{
					EntitlementSlug: entitlementSlug,
					Threshold:       threshold,
					Value:           updatedUsage.Value,
					Overage:         updatedUsage.Value - threshold,
				},
				outbox.AuditHeaders{InstanceID: &entitlementUsageCtx.InstanceID},
			).At(reportedAt)
			if err := h.outbox.CreateOutboxEvent(ctx, event); err != nil {
				return err
			}
		}

		if !unlimited && entitlementUsageCtx.WarningThresholdPercent > 0 {
			boundary := entitlementvalue.WarningBoundary(threshold, entitlementUsageCtx.WarningThresholdPercent)
			if entitlementvalue.Crossed(currentUsage.Value, updatedUsage.Value, boundary) {
				event := outbox.NewOutboxMessage(
					user.OrganizationID,
					events.InstanceEntitlementUsageWarningThresholdReached.Name,
					events.InstanceEntitlementUsageWarningThresholdReached.Type,
					InstanceEntitlementUsageWarningThresholdReached{
						EntitlementSlug: entitlementSlug,
						Threshold:       threshold,
						Boundary:        boundary,
						Value:           updatedUsage.Value,
					},
					outbox.AuditHeaders{InstanceID: &entitlementUsageCtx.InstanceID},
				).At(reportedAt)
				if err := h.outbox.CreateOutboxEvent(ctx, event); err != nil {
					return err
				}
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	if thresholdExceeded {
		return nil, kaitenerrors.Conflict("ReportEntitlementUsageMetric.ThresholdExceeded",
			fmt.Sprintf("Usage for %s exceeds the allowed threshold", entitlementSlug))
	}

	out := &Result{Usage: result, Replayed: replayed}
	if metadataTooLarge && !replayed {
		h.metadataDropped.Add(ctx, 1, metric.WithAttributes(attribute.String("reason", metadataDroppedTooLarge)))
		out.MetadataDropped = metadataDroppedTooLarge
	}
	return out, nil
}

func computeUpdatedUsage(command *Command, current *entitlementvalue.NumberUsageValue, aggregationMethod string) (*entitlementvalue.NumberUsageValue, error) {
	switch command.Behavior {
	case BehaviorSet:
		// EventCount is 1, not 0: a set IS one reported observation of the
		// counter, and the pair {value, eventCount} has to stay coherent --
		// {60, 0} would claim a value nothing produced. It is also what makes
		// a following AVERAGE append correct, since averageAppendStrategy
		// folds on the stored count: ((60*1)+40)/2 = 50, the average of the
		// two observations. With 0 it would compute ((60*0)+40)/1 = 40 and
		// the value just set would vanish from the average.
		//
		// Note this is not the "cannot correct downward" path: a set writes
		// the ABSOLUTE value, so correcting 60 down to 25 under a cap of 30
		// is compared as 25 > 30 and accepted. Only a set that lands ABOVE
		// the cap is rejected, and only under HARD enforcement.
		return &entitlementvalue.NumberUsageValue{
			Type:       entitlementvalue.TypeNumber,
			Value:      command.Value,
			EventCount: 1,
		}, nil

	case BehaviorAppend:
		strategy, err := SelectAppendStrategy(aggregationMethod)
		if err != nil {
			return nil, kaitenerrors.Validation("ReportEntitlementUsageMetric.InvalidAggregationConfiguration", err.Error())
		}
		return &entitlementvalue.NumberUsageValue{
			Type:       entitlementvalue.TypeNumber,
			Value:      strategy.Apply(current.Value, command.Value, current.EventCount),
			EventCount: current.EventCount + 1,
		}, nil

	default:
		return nil, kaitenerrors.Validation(
			"ReportEntitlementUsageMetric.InvalidBehavior",
			"behavior must be one of: append, set",
		)
	}
}

// resolveAggregationMethod defaults to SUM: entitlements created before
// aggregationMethod became mandatory for NUMBER entitlements may still have
// it unset, and SUM preserves the original CALCULATED_USAGE behavior.
func resolveAggregationMethod(aggregationMethod *db.AggregationMethod) string {
	if aggregationMethod == nil {
		return string(db.AggregationMethodSUM)
	}
	return string(*aggregationMethod)
}

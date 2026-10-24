package reportentitlementusagemetric

import (
	"context"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	entitlementUsageSchema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	ReservationTTL    time.Duration
	ReservationMaxTTL time.Duration
	UserProvider      currentuser.Provider
	UsageReporter     services.UsageReporter
	Uof               *uow.UnitOfWork
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
	if deps.ReservationTTL == 0 {
		deps.ReservationTTL = DefaultReservationTTL
	}
	if deps.ReservationMaxTTL == 0 {
		deps.ReservationMaxTTL = DefaultReservationMaxTTL
	}
	if deps.IdempotencyWindow <= 0 {
		deps.IdempotencyWindow = DefaultIdempotencyWindow
	}

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

// Execute uses one locked transaction for replay, planning and atomic accounting.
func (h *UseCase) Execute(ctx context.Context, instanceSlug, entitlementSlug string, command *Command) (*Result, error) {
	return h.executeReport(ctx, instanceSlug, entitlementSlug, command)
}

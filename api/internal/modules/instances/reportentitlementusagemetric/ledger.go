package reportentitlementusagemetric

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	entitlementUsageSchema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
)

// usageLedgerTable is the partitioned table AppendUsageLedger writes; a row
// dated outside every partition fails on it (apierrors.IsMissingPartition).
const usageLedgerTable = "usage_ledger"

// LedgerEntry is one ACCEPTED report as the usage journal records it.
type LedgerEntry struct {
	OrganizationID uuid.UUID
	InstanceID     uuid.UUID
	EntitlementID  uuid.UUID
	// LicenseID is the instance's licence version when the report was accepted.
	LicenseID uuid.UUID
	// ReportSeq is what AcceptEntitlementUsage returned for this report.
	ReportSeq  int64
	ReportedAt time.Time
	// WindowStart/WindowEnd are the reset window the counter was in after any
	// rollover; nil for a lifetime counter.
	WindowStart, WindowEnd *time.Time
	Behavior               Behavior
	AggregationMethod      string
	// ReportedValue is the value as sent: a delta for append, an absolute for
	// set. ValueBefore is the counter after any rollover reset and before this
	// report, ValueAfter the committed counter.
	ReportedValue, ValueBefore, ValueAfter float64
	EventCountAfter                        int32
	// Threshold and OveragePercent are the grant the gate applied to this
	// report. entitlementvalue.UnlimitedThreshold is journalled as a NULL
	// limit with percent -1.
	Threshold      float64
	OveragePercent int32
	TransactionID  *string
	Properties     []byte
}

// AcceptEntitlementUsage writes the counter of an ACCEPTED report and returns
// the pair's new report_seq. periodStart is nil for a lifetime entitlement.
func (r *CommandRepository) AcceptEntitlementUsage(ctx context.Context, instanceID, entitlementID uuid.UUID, value []byte, organizationID uuid.UUID, periodStart *time.Time) (int64, error) {
	return r.q(ctx).AcceptEntitlementUsage(ctx, db.AcceptEntitlementUsageParams{
		InstanceID:     instanceID,
		EntitlementID:  entitlementID,
		Value:          value,
		OrganizationID: organizationID,
		PeriodStart:    timestamp(periodStart),
	})
}

// AppendUsageLedger writes the journal row of one ACCEPTED report, in the
// caller's transaction.
func (r *CommandRepository) AppendUsageLedger(ctx context.Context, e LedgerEntry) error {
	var limitValue *string
	overagePercent := e.OveragePercent
	if entitlementvalue.IsUnlimitedThreshold(e.Threshold) {
		overagePercent = -1
	} else {
		limit := decimalString(e.Threshold)
		limitValue = &limit
	}

	return r.q(ctx).AppendUsageLedger(ctx, db.AppendUsageLedgerParams{
		OrganizationID:    e.OrganizationID,
		InstanceID:        e.InstanceID,
		EntitlementID:     e.EntitlementID,
		LicenseID:         e.LicenseID,
		ReportSeq:         e.ReportSeq,
		ReportedAt:        pgtype.Timestamp{Time: e.ReportedAt, Valid: true},
		WindowStart:       timestamp(e.WindowStart),
		WindowEnd:         timestamp(e.WindowEnd),
		Behavior:          db.UsageReportBehavior(e.Behavior),
		AggregationMethod: db.AggregationMethod(e.AggregationMethod),
		ReportedValue:     decimalString(e.ReportedValue),
		ValueBefore:       decimalString(e.ValueBefore),
		ValueAfter:        decimalString(e.ValueAfter),
		EventCountAfter:   e.EventCountAfter,
		LimitValue:        limitValue,
		OveragePercent:    int16(overagePercent),
		TransactionID:     e.TransactionID,
		Properties:        e.Properties,
	})
}

// decimalString formats a float64 counter value as the shortest decimal that
// parses back to the same float64, for a NUMERIC column. Going through
// float8::numeric in SQL instead would round to 15 significant digits, and
// value_after - value_before would stop being the counter's own movement.
func decimalString(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}

func timestamp(t *time.Time) pgtype.Timestamp {
	if t == nil {
		return pgtype.Timestamp{}
	}
	return pgtype.Timestamp{Time: *t, Valid: true}
}

// AcceptedReport is the journal row an idempotency key was accepted under:
// what a replay answers with and a conflict points at.
type AcceptedReport struct {
	ReportSeq       int64
	ReportedAt      time.Time
	WindowStart     *time.Time
	WindowEnd       *time.Time
	Behavior        Behavior
	ReportedValue   string
	SameValue       bool
	ValueAfter      float64
	EventCountAfter int32
	// Limit is the grant the report was gated with, -1 when unlimited.
	Limit       float64
	LicenseID   uuid.UUID
	LicenseSlug string
}

// FindReportByTransactionID returns the report the pair accepted under
// transactionID within [notBefore, notAfter), or nil when there is none.
// value is the incoming report's value, compared as NUMERIC (SameValue).
func (r *QueryRepository) FindReportByTransactionID(
	ctx context.Context, organizationID, instanceID, entitlementID uuid.UUID,
	transactionID string, value float64, notBefore, notAfter time.Time,
) (*AcceptedReport, error) {
	row, err := r.q(ctx).FindUsageReportByTransactionID(ctx, db.FindUsageReportByTransactionIDParams{
		Value:          decimalString(value),
		OrganizationID: organizationID,
		InstanceID:     instanceID,
		EntitlementID:  entitlementID,
		TransactionID:  &transactionID,
		NotBefore:      pgtype.Timestamp{Time: notBefore, Valid: true},
		NotAfter:       pgtype.Timestamp{Time: notAfter, Valid: true},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	report := &AcceptedReport{
		ReportSeq:       row.ReportSeq,
		ReportedAt:      row.ReportedAt.Time.UTC(),
		WindowStart:     optionalTime(row.WindowStart),
		WindowEnd:       optionalTime(row.WindowEnd),
		Behavior:        Behavior(row.Behavior),
		ReportedValue:   row.ReportedValue,
		SameValue:       row.SameValue,
		ValueAfter:      row.ValueAfter,
		EventCountAfter: row.EventCountAfter,
		Limit:           row.LimitValue,
		LicenseID:       row.LicenseID,
	}
	if row.LicenseSlug != nil {
		report.LicenseSlug = *row.LicenseSlug
	}
	return report, nil
}

// response rebuilds, from the journal row alone, the response the report
// got when it was accepted: the counter and window as they were then, not
// as they are now.
func (a *AcceptedReport) response(entitlementID uuid.UUID, entitlementSlug string) *entitlementUsageSchema.EntitlementUsage {
	return &entitlementUsageSchema.EntitlementUsage{
		EntitlementID:   entitlementID,
		EntitlementSlug: entitlementSlug,
		LicenseID:       a.LicenseID,
		LicenseSlug:     a.LicenseSlug,
		Value: entitlementUsageSchema.EntitlementValue{
			Number: &entitlementUsageSchema.NumberEntitlementValue{
				Type:       entitlementvalue.TypeNumber,
				Value:      a.ValueAfter,
				EventCount: a.EventCountAfter,
			},
		},
		Limit: &entitlementUsageSchema.EntitlementValue{
			Number: &entitlementUsageSchema.NumberEntitlementValue{
				Type:  entitlementvalue.TypeNumber,
				Value: a.Limit,
			},
		},
		CurrentPeriodStart: a.WindowStart,
		CurrentPeriodEnd:   a.WindowEnd,
	}
}

func optionalTime(t pgtype.Timestamp) *time.Time {
	if !t.Valid {
		return nil
	}
	utc := t.Time.UTC()
	return &utc
}

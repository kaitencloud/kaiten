// Package ports is what the billing module needs from other modules, stated
// by billing and implemented by them. Billing reads the usage journal only
// through UsageSource: the instances module owns the journal and is its only
// writer.
package ports

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usagehistory"
)

// ErrClockBehind is Seal answering that the database clock has not reached the
// boundary yet: the close tries again on its next pass.
var ErrClockBehind = errors.New("database clock is behind the boundary")

// UsageRef names one metered pair: an instance and one of its entitlements.
type UsageRef struct {
	OrganizationID uuid.UUID
	InstanceID     uuid.UUID
	EntitlementID  uuid.UUID
}

// Watermark is where a pair's journal stood when it was sealed.
type Watermark struct {
	ReportSeq int64
	SealedAt  time.Time
}

// WindowSegment is a pair's journal rows inside one reset window, summed.
// Usage and Overage are raw: the floor at 0 is the rating's to apply.
type WindowSegment struct {
	WindowStart *time.Time
	WindowEnd   *time.Time
	Usage       decimal.Decimal
	Overage     decimal.Decimal
	Rows        int64
	FirstSeq    int64
	LastSeq     int64
}

// AppliedLimit is one (limit, overage percent) the gate applied, with the
// number of rows it applied to. A nil Limit is unlimited.
type AppliedLimit struct {
	Limit          *decimal.Decimal
	OveragePercent int32
	Rows           int64
}

// Fingerprint identifies the rows a summary was computed from. Nil seqs and
// zero rows for an empty range.
type Fingerprint struct {
	FirstSeq   *int64
	LastSeq    *int64
	Rows       int64
	SumDelta   decimal.Decimal
	SumOverage decimal.Decimal
}

// UsageSummary is a pair's journal over a half-open interval.
type UsageSummary struct {
	Windows     []WindowSegment
	Limits      []AppliedLimit
	Fingerprint Fingerprint
}

// Invariant is one of the journal invariants the period close checks.
type Invariant string

const (
	// InvariantSequenceGap: the pair's report_seq values are not one gapless
	// range from the period's first row to the live counter.
	InvariantSequenceGap Invariant = "LEDGER_SEQUENCE_GAP"
	// InvariantChainBreak: inside a reset window, a row's value before is not
	// the previous row's value after, or a window opened after the journal
	// existed does not start at 0.
	InvariantChainBreak Invariant = "LEDGER_CHAIN_BREAK"
	// InvariantCounterMismatch: the live counter disagrees with the journal's
	// last row in the same window.
	InvariantCounterMismatch Invariant = "LEDGER_COUNTER_MISMATCH"
)

// InvariantFailure is one failed invariant, with what was expected and found.
type InvariantFailure struct {
	Invariant        Invariant `json:"invariant"`
	Expected         string    `json:"expected"`
	Found            string    `json:"found"`
	FirstSeq         *int64    `json:"firstSeq"`
	LastSeq          *int64    `json:"lastSeq"`
	CounterReportSeq *int64    `json:"counterReportSeq"`
}

// UsageSource is the usage journal as billing reads it.
type UsageSource interface {
	// Seal waits for every report dated before through to commit: it takes the
	// pair's lock, so a report in flight finishes first, then reads the
	// database clock, so every later report is dated at or after through. It
	// answers ErrClockBehind when that clock is still before through. It runs
	// its own short transaction and is idempotent.
	Seal(ctx context.Context, ref UsageRef, through time.Time) (Watermark, error)
	// Summarize sums the pair's rows dated in [from, to) by reset window, in
	// the transaction ctx carries.
	Summarize(ctx context.Context, ref UsageRef, from, to time.Time) (UsageSummary, error)
	// CheckInvariants evaluates the journal invariants over the rows dated in
	// [from, to), the counter and the journal's tail in one statement, so a
	// concurrent report cannot make it fail. prev is the pair's fingerprint on
	// the subscription's previous invoice, when it has one: the period must
	// start right after it. Failures come in invariant order.
	CheckInvariants(ctx context.Context, ref UsageRef, from, to time.Time, prev *Fingerprint) ([]InvariantFailure, error)
	// ListReports reads up to limit of the pair's reports dated in [from, to)
	// after afterSeq, in report_seq order, and whether more follow: the rows
	// behind a metered invoice line.
	ListReports(ctx context.Context, ref UsageRef, from, to time.Time, afterSeq int64, limit int32) ([]usagehistory.UsageReport, bool, error)
	// ExportReports streams the same rows, every one, as format.
	ExportReports(ref UsageRef, from, to time.Time, format usagehistory.Format, name string) *usagehistory.Export
	// RetentionStart is the earliest instant the organization's usage history
	// still serves, or nil when it keeps everything or cannot tell.
	RetentionStart(ctx context.Context, organizationID uuid.UUID, now time.Time) *time.Time
	// RetentionMonths is the organization's usage history window in months, 0
	// when it keeps everything; false when it cannot be told.
	RetentionMonths(ctx context.Context, organizationID uuid.UUID) (int, bool)
}

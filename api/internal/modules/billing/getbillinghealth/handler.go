package getbillinghealth

import (
	"context"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
)

// BillingHealth is what an organization's billing needs attention for,
// computed when read (§19.3). Every member written |null there is present,
// and null when there is nothing to report (V31-03).
type BillingHealth struct {
	CloseBacklog                CloseBacklog   `json:"closeBacklog" doc:"Subscriptions whose period ended more than KAITEN_BILLING_CLOSE_GRACE ago and has not closed yet"`
	HeldInvoices                HeldInvoices   `json:"heldInvoices"`
	PushFailures                PushFailures   `json:"pushFailures" doc:"Invoices whose push failed at least as many times as the alert threshold"`
	ReconciliationMismatches30d int64          `json:"reconciliationMismatches30d" doc:"Invoices whose provider's amounts differed from Kaiten's, in the last 30 days"`
	ProviderSync                []ProviderSync `json:"providerSync" nullable:"false"`
	PastDueSubscriptions        int64          `json:"pastDueSubscriptions"`
	OverdueInvoices             int64          `json:"overdueInvoices"`
	Handoff                     HandoffBacklog `json:"handoff"`
	PaymentMethodsExpiring30d   int64          `json:"paymentMethodsExpiring30d" doc:"ACTIVE payment methods whose card expires in the next 30 days"`
	UsageLedger                 UsageLedger    `json:"usageLedger"`
}

// CloseBacklog is the subscriptions waiting for their close.
type CloseBacklog struct {
	Count       int64      `json:"count"`
	OldestDueAt *time.Time `json:"oldestDueAt"`
}

// HeldInvoices counts the held drafts, by reason.
type HeldInvoices struct {
	Count    int64            `json:"count"`
	ByReason map[string]int64 `json:"byReason"`
}

// PushFailures is the invoices a provider keeps refusing.
type PushFailures struct {
	Count          int64      `json:"count"`
	OldestFailedAt *time.Time `json:"oldestFailedAt"`
}

// ProviderSync is one provider's sync health.
type ProviderSync struct {
	ProviderKind         string     `json:"providerKind" enum:"NOOP,STRIPE"`
	LastSyncedAt         *time.Time `json:"lastSyncedAt" doc:"The end of the last pass, whatever its status; null before the first"`
	LastSuccessfulSyncAt *time.Time `json:"lastSuccessfulSyncAt" doc:"The end of the last pass that ended SUCCESS; null before the first (V31-11)"`
	LastSyncStatus       *string    `json:"lastSyncStatus" enum:"SUCCESS,PARTIAL,FAILED"`
	LastSyncError        *string    `json:"lastSyncError"`
	ConsecutiveFailures  int32      `json:"consecutiveFailures"`
	LagSeconds           *int64     `json:"lagSeconds" doc:"Seconds since the last pass; null before the first"`
	LastFullSweepAt      *time.Time `json:"lastFullSweepAt"`
}

// HandoffBacklog is the invoices waiting for the accounting system.
type HandoffBacklog struct {
	Pending               int64      `json:"pending"`
	OldestPendingIssuedAt *time.Time `json:"oldestPendingIssuedAt"`
	ReclaimedLast24h      int64      `json:"reclaimedLast24h" doc:"PENDING invoices claimed again after a lease expired, whose latest lease runs or ended in the last 24 hours: a consumer that claims and does not acknowledge"`
}

// UsageLedger is the usage history the organization keeps (§6.5, V31-11).
type UsageLedger struct {
	RetentionMonths *int   `json:"retentionMonths" doc:"How long usage reports are kept, in months; null when they are kept forever (ENV) or the retention is unknown (UNKNOWN)"`
	RetentionSource string `json:"retentionSource" enum:"KBK,ENV,UNKNOWN" doc:"KBK: the organization's licence or an add-on; ENV: KAITEN_USAGE_LEDGER_RETENTION_MONTHS, with no licensing authority; UNKNOWN: the licensing authority could not tell"`
}

type UseCase struct {
	deps               access.Deps
	alertAfterAttempts int
	closeGrace         time.Duration
}

func NewUseCase(deps access.Deps, alertAfterAttempts int, closeGrace time.Duration) *UseCase {
	if alertAfterAttempts <= 0 {
		alertAfterAttempts = 5
	}
	return &UseCase{deps: deps, alertAfterAttempts: alertAfterAttempts, closeGrace: closeGrace}
}

// Execute computes the organization's billing health.
func (u *UseCase) Execute(ctx context.Context) (*BillingHealth, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	now, err := lifecycle.Now(ctx, q)
	if err != nil {
		return nil, err
	}
	row, err := q.BillingHealth(ctx, db.BillingHealthParams{
		OrganizationID: user.OrganizationID, Now: invoices.Timestamp(now), CloseBefore: invoices.Timestamp(now.Add(-u.closeGrace)),
		AutoCollectionBefore: invoices.Timestamp(u.deps.AutoCollectionBefore(now)),
		AlertAfterAttempts:   int32(u.alertAfterAttempts), //nolint:gosec // bounded by the configuration
	})
	if err != nil {
		return nil, err
	}
	states, err := q.ListSyncStates(ctx, user.OrganizationID)
	if err != nil {
		return nil, err
	}
	health := &BillingHealth{
		CloseBacklog: CloseBacklog{Count: row.CloseBacklog, OldestDueAt: invoices.TimePtr(row.OldestDueAt)},
		HeldInvoices: HeldInvoices{Count: row.Held, ByReason: map[string]int64{
			"LEDGER_SEQUENCE_GAP": row.HeldSequenceGap, "LEDGER_CHAIN_BREAK": row.HeldChainBreak, "LEDGER_COUNTER_MISMATCH": row.HeldCounterMismatch,
			"PROVIDER_ITEM_LIMIT": row.HeldProviderItemLimit,
		}},
		PushFailures:                PushFailures{Count: row.PushFailures, OldestFailedAt: invoices.TimePtr(row.OldestPushFailureAt)},
		ReconciliationMismatches30d: row.ReconciliationMismatches,
		ProviderSync:                []ProviderSync{},
		PastDueSubscriptions:        row.PastDue,
		OverdueInvoices:             row.Overdue,
		Handoff: HandoffBacklog{
			Pending: row.HandoffPending, OldestPendingIssuedAt: invoices.TimePtr(row.OldestPendingIssuedAt),
			ReclaimedLast24h: row.HandoffReclaimedLast24h,
		},
		PaymentMethodsExpiring30d: row.PaymentMethodsExpiring30d,
		UsageLedger:               UsageLedger{RetentionMonths: nil, RetentionSource: "UNKNOWN"},
	}
	if u.deps.Usage != nil {
		months, source := u.deps.Usage.RetentionWindow(ctx, user.OrganizationID)
		health.UsageLedger.RetentionSource = source
		if months > 0 {
			health.UsageLedger.RetentionMonths = &months
		}
	}
	for _, state := range states {
		sync := ProviderSync{
			ProviderKind: string(state.ProviderKind), LastSyncedAt: invoices.TimePtr(state.LastSyncedAt), LastSyncStatus: nil,
			LastSyncError: state.LastSyncError, ConsecutiveFailures: state.ConsecutiveFailures, LagSeconds: nil,
			LastFullSweepAt: invoices.TimePtr(state.LastFullSweepAt), LastSuccessfulSyncAt: invoices.TimePtr(state.LastSuccessfulSyncAt),
		}
		if state.LastSyncStatus != nil {
			status := string(*state.LastSyncStatus)
			sync.LastSyncStatus = &status
		}
		if state.LastSyncedAt.Valid {
			lag := int64(now.Sub(state.LastSyncedAt.Time.UTC()).Seconds())
			sync.LagSeconds = &lag
		}
		health.ProviderSync = append(health.ProviderSync, sync)
	}
	return health, nil
}

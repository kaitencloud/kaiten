// Package telemetry is billing's metrics (§19.1) that more than one use case
// records, and the deployment-wide gauges the alerts of §19.2 watch. Names
// follow the house's OpenTelemetry style: billing_invoice_push_total in the
// spec is kaiten.billing.invoice.push here, exported as
// kaiten_billing_invoice_push_total.
//
// A metric that fails to register is nil and every recorder tolerates it:
// telemetry never fails billing.
package telemetry

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
)

const meterName = "kaiten.billing"

// Push results, as billing_invoice_push_total labels them.
const (
	PushPushed         = "pushed"
	PushFailed         = "failed"
	PushPaid           = "paid"
	PushPaymentFailed  = "payment_failed"
	PushRequiresAction = "requires_action"
)

type instruments struct {
	push          metric.Int64Counter
	attempts      metric.Int64Histogram
	compensations metric.Int64Counter
	mismatches    metric.Int64Counter
	recreated     metric.Int64Counter
	itemFailures  metric.Int64Counter
	duplicates    metric.Int64Counter
	leaseExpired  metric.Int64Counter
	negative      metric.Int64Counter
	skipped       metric.Int64Counter
}

var get = sync.OnceValue(func() *instruments {
	meter := otel.GetMeterProvider().Meter(meterName)
	counter := func(name, description, unit string) metric.Int64Counter {
		c, err := meter.Int64Counter(name, metric.WithDescription(description), metric.WithUnit(unit))
		if err != nil {
			slog.Warn("failed to register a billing metric", "metric", name, "error", err)
			return nil
		}
		return c
	}
	attempts, err := meter.Int64Histogram("kaiten.billing.invoice.push.attempts",
		metric.WithDescription("Push attempts an invoice took to be PUSHED, by provider"), metric.WithUnit("{attempt}"),
		metric.WithExplicitBucketBoundaries(1, 2, 3, 5, 8, 13, 21))
	if err != nil {
		slog.Warn("failed to register a billing metric", "metric", "kaiten.billing.invoice.push.attempts", "error", err)
		attempts = nil
	}
	return &instruments{
		push: counter("kaiten.billing.invoice.push",
			"Invoice pushes and automatic charges, by provider and result (pushed, failed, paid, payment_failed, requires_action)", "{invoice}"),
		attempts: attempts,
		compensations: counter("kaiten.billing.push.compensations",
			"Provider invoices removed because the Kaiten invoice was voided during its push", "{invoice}"),
		mismatches: counter("kaiten.billing.reconciliation.mismatch",
			"Invoices whose provider copy differs from Kaiten's at reconciliation, by provider", "{invoice}"),
		recreated: counter("kaiten.billing.provider.customer_recreated",
			"Mapped provider customers that were deleted in the provider and created again", "{customer}"),
		itemFailures: counter("kaiten.billing.job.item_failures",
			"Units a billing job failed on and left for a later pass, by job and reason (error, panic)", "{unit}"),
		duplicates: counter("kaiten.billing.duplicate_suppressed",
			"Writes a uniqueness key turned into no-ops, by job: a retry or a concurrent run got there first", "{write}"),
		leaseExpired: counter("kaiten.billing.handoff.lease_expired",
			"Handoff invoices claimed again after an earlier claim's lease expired", "{invoice}"),
		negative: counter("kaiten.billing.usage.negative_segments",
			"Usage segments that went down and were billed as 0 (D-06)", "{segment}"),
		skipped: counter("kaiten.billing.voucher_currency_skipped",
			"Fixed-amount vouchers left out of an invoice in another currency (§8.4 rule 5)", "{voucher}"),
	}
})

func provider(kind string) metric.MeasurementOption {
	return metric.WithAttributes(attribute.String("provider", kind))
}

// InvoicePush records one push or charge outcome.
func InvoicePush(ctx context.Context, providerKind, result string) {
	if c := get().push; c != nil {
		c.Add(ctx, 1, metric.WithAttributes(attribute.String("provider", providerKind), attribute.String("result", result)))
	}
}

// Pushed records the attempts an invoice took to be PUSHED.
func Pushed(ctx context.Context, providerKind string, attempts int32) {
	InvoicePush(ctx, providerKind, PushPushed)
	if h := get().attempts; h != nil {
		h.Record(ctx, int64(attempts), provider(providerKind))
	}
}

// Compensated records a provider invoice removed for an invoice voided
// during its push.
func Compensated(ctx context.Context, providerKind string) {
	if c := get().compensations; c != nil {
		c.Add(ctx, 1, provider(providerKind))
	}
}

// Mismatched records a reconciliation mismatch.
func Mismatched(ctx context.Context, providerKind string) {
	if c := get().mismatches; c != nil {
		c.Add(ctx, 1, provider(providerKind))
	}
}

// CustomerRecreated records a provider customer created again.
func CustomerRecreated(ctx context.Context, providerKind string) {
	if c := get().recreated; c != nil {
		c.Add(ctx, 1, provider(providerKind))
	}
}

// Gauges reads what the gauges observe.
type Gauges struct {
	// Queries reads over every organization.
	Queries func(ctx context.Context) *db.Queries
	// Now is the billing clock.
	Now func(ctx context.Context, q *db.Queries) (time.Time, error)
	// CloseGrace is how long after its end a period is due (§16.4).
	CloseGrace time.Duration
}

// gaugeTimeout bounds one collection's queries.
const gaugeTimeout = 5 * time.Second

// RegisterGauges registers the deployment-wide gauges, read at each metrics
// collection: the close backlog, the PAST_DUE subscriptions, the oldest
// invoice waiting in the handoff queue, the payment methods expiring within
// 30 days, and each provider's sync lag. A failed read skips the collection.
func RegisterGauges(g Gauges) {
	meter := otel.GetMeterProvider().Meter(meterName)
	gauge := func(name, description, unit string) metric.Int64ObservableGauge {
		o, err := meter.Int64ObservableGauge(name, metric.WithDescription(description), metric.WithUnit(unit))
		if err != nil {
			slog.Warn("failed to register a billing gauge", "metric", name, "error", err)
			return nil
		}
		return o
	}
	backlog := gauge("kaiten.billing.period_close.backlog", "Due subscriptions whose period is not closed yet", "{subscription}")
	pastDue := gauge("kaiten.billing.past_due_subscriptions", "PAST_DUE subscriptions", "{subscription}")
	handoff := gauge("kaiten.billing.handoff.pending_oldest", "Age of the oldest invoice waiting in the handoff queue; 0 when none waits", "s")
	expiring := gauge("kaiten.billing.payment_methods.expiring_30d", "Active payment methods whose expiry month ends within 30 days", "{payment_method}")
	syncLag := gauge("kaiten.billing.provider.sync_lag", "Per provider, time since the least recent sync of any organization", "s")

	var observables []metric.Observable
	for _, o := range []metric.Int64ObservableGauge{backlog, pastDue, handoff, expiring, syncLag} {
		if o != nil {
			observables = append(observables, o)
		}
	}
	if len(observables) == 0 {
		return
	}
	_, err := meter.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
		ctx, cancel := context.WithTimeout(ctx, gaugeTimeout)
		defer cancel()
		q := g.Queries(ctx)
		now, err := g.Now(ctx, q)
		if err != nil {
			slog.WarnContext(ctx, "billing gauges: no clock", "error", err)
			return nil
		}
		row, err := q.BillingGauges(ctx, db.BillingGaugesParams{CloseBefore: timestamp(now.Add(-g.CloseGrace)), Now: timestamp(now)})
		if err != nil {
			slog.WarnContext(ctx, "billing gauges: read failed", "error", err)
			return nil
		}
		observe(o, backlog, row.CloseBacklog)
		observe(o, pastDue, row.PastDue)
		observe(o, expiring, row.PaymentMethodsExpiring)
		var oldest int64
		if row.OldestPendingIssuedAt.Valid {
			oldest = int64(now.Sub(row.OldestPendingIssuedAt.Time).Seconds())
		}
		observe(o, handoff, max(oldest, 0))
		syncs, err := q.OldestProviderSync(ctx)
		if err != nil {
			slog.WarnContext(ctx, "billing gauges: sync states unreadable", "error", err)
			return nil
		}
		for _, s := range syncs {
			if syncLag != nil && s.OldestSyncedAt.Valid {
				o.ObserveInt64(syncLag, max(int64(now.Sub(s.OldestSyncedAt.Time).Seconds()), 0), provider(string(s.ProviderKind)))
			}
		}
		return nil
	}, observables...)
	if err != nil {
		slog.Warn("failed to register the billing gauges' callback", "error", err)
	}
}

func timestamp(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: t.UTC(), InfinityModifier: pgtype.Finite, Valid: true}
}

func observe(o metric.Observer, gauge metric.Int64ObservableGauge, value int64) {
	if gauge != nil {
		o.ObserveInt64(gauge, value)
	}
}

// Billing jobs, as their metrics name them.
const (
	JobPeriodClose  = "billing-period-close"
	JobInvoicePush  = "billing-invoice-push"
	JobProviderSync = "billing-provider-sync"
	JobLifecycle    = "billing-lifecycle"
)

// Unit runs one unit of a job's pass (§16.1 rule 7): a panic in it fails that
// unit only, and a failure is counted.
func Unit(ctx context.Context, job string, work func() error) (err error) {
	panicked := false
	defer func() {
		if r := recover(); r != nil {
			panicked, err = true, fmt.Errorf("panic in %s: %v", job, r)
		}
		if err != nil {
			ItemFailed(ctx, job, panicked)
		}
	}()
	return work()
}

// ItemFailed counts a unit job failed on (§16.1 rule 7): reason is panic when
// it panicked, error otherwise.
func ItemFailed(ctx context.Context, job string, panicked bool) {
	if c := get().itemFailures; c != nil {
		reason := "error"
		if panicked {
			reason = "panic"
		}
		c.Add(ctx, 1, metric.WithAttributes(attribute.String("job", job), attribute.String("reason", reason)))
	}
}

// DuplicateSuppressed counts a write a uniqueness key made a no-op (§16.1
// rule 3).
func DuplicateSuppressed(ctx context.Context, job string) {
	if c := get().duplicates; c != nil {
		c.Add(ctx, 1, metric.WithAttributes(attribute.String("job", job)))
	}
}

// LeaseExpired counts handoff invoices claimed again after a lease expired.
func LeaseExpired(ctx context.Context, n int) {
	if c := get().leaseExpired; c != nil && n > 0 {
		c.Add(ctx, int64(n))
	}
}

// NegativeSegments counts usage segments floored at 0.
func NegativeSegments(ctx context.Context, n int) {
	if c := get().negative; c != nil && n > 0 {
		c.Add(ctx, int64(n))
	}
}

// VoucherCurrencySkipped counts fixed-amount vouchers left out of an invoice
// in another currency.
func VoucherCurrencySkipped(ctx context.Context, n int) {
	if c := get().skipped; c != nil && n > 0 {
		c.Add(ctx, int64(n))
	}
}

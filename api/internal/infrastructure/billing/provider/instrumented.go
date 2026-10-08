package provider

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// callDuration is billing_provider_call_duration_seconds (§19.1): every call
// billing makes to a provider, by provider, operation and outcome.
var callDuration = sync.OnceValue(func() metric.Float64Histogram {
	h, err := otel.GetMeterProvider().Meter("kaiten.billing").Float64Histogram(
		"kaiten.billing.provider.call.duration",
		metric.WithDescription("Calls to a payment provider, by provider, operation and outcome (ok, or the failure's class)"),
		metric.WithUnit("s"),
	)
	if err != nil {
		slog.Warn("failed to register the provider call metric", "error", err)
	}
	return h
})

// instrumented times every call of the adapter it wraps. It is what a
// resolved Connection carries; the registered adapters themselves, which
// billing type-asserts for optional capabilities, are left as they are.
type instrumented struct {
	Adapter
}

func instrument(adapter Adapter) Adapter {
	if _, already := adapter.(instrumented); already {
		return adapter
	}
	return instrumented{Adapter: adapter}
}

func (a instrumented) observe(ctx context.Context, operation string, start time.Time, err error) {
	h := callDuration()
	if h == nil {
		return
	}
	outcome := "ok"
	switch {
	case err == nil:
	case errors.Is(err, ErrUnsupported):
		outcome = "unsupported"
	default:
		outcome = string(ClassOf(err))
	}
	h.Record(ctx, time.Since(start).Seconds(), metric.WithAttributes(
		attribute.String("provider", string(a.Kind())), attribute.String("operation", operation), attribute.String("outcome", outcome),
	))
}

func (a instrumented) EnsureCustomer(ctx context.Context, ref Ref, customer Customer) (CustomerRecord, error) {
	start := time.Now()
	out, err := a.Adapter.EnsureCustomer(ctx, ref, customer)
	a.observe(ctx, "ensure_customer", start, err)
	return out, err
}

func (a instrumented) FindInvoice(ctx context.Context, ref Ref, externalCustomerID string, kaitenInvoiceID uuid.UUID) (*Invoice, error) {
	start := time.Now()
	out, err := a.Adapter.FindInvoice(ctx, ref, externalCustomerID, kaitenInvoiceID)
	a.observe(ctx, "find_invoice", start, err)
	return out, err
}

func (a instrumented) CreateDraft(ctx context.Context, ref Ref, invoice NormalizedInvoice) (Invoice, error) {
	start := time.Now()
	out, err := a.Adapter.CreateDraft(ctx, ref, invoice)
	a.observe(ctx, "create_draft", start, err)
	return out, err
}

func (a instrumented) AddDiscount(ctx context.Context, ref Ref, externalInvoiceID string, invoice NormalizedInvoice, discount NormalizedDiscount) (string, error) {
	start := time.Now()
	out, err := a.Adapter.AddDiscount(ctx, ref, externalInvoiceID, invoice, discount)
	a.observe(ctx, "add_discount", start, err)
	return out, err
}

func (a instrumented) AddLine(ctx context.Context, ref Ref, externalInvoiceID string, invoice NormalizedInvoice, line NormalizedLine) (string, error) {
	start := time.Now()
	out, err := a.Adapter.AddLine(ctx, ref, externalInvoiceID, invoice, line)
	a.observe(ctx, "add_line", start, err)
	return out, err
}

func (a instrumented) DeleteLine(ctx context.Context, ref Ref, externalInvoiceID, externalLineID string) error {
	start := time.Now()
	err := a.Adapter.DeleteLine(ctx, ref, externalInvoiceID, externalLineID)
	a.observe(ctx, "delete_line", start, err)
	return err
}

func (a instrumented) DeleteDiscount(ctx context.Context, ref Ref, externalDiscountID string) error {
	start := time.Now()
	err := a.Adapter.DeleteDiscount(ctx, ref, externalDiscountID)
	a.observe(ctx, "delete_discount", start, err)
	return err
}

func (a instrumented) Finalize(ctx context.Context, ref Ref, externalInvoiceID string, invoice NormalizedInvoice) (Invoice, error) {
	start := time.Now()
	out, err := a.Adapter.Finalize(ctx, ref, externalInvoiceID, invoice)
	a.observe(ctx, "finalize", start, err)
	return out, err
}

func (a instrumented) GetInvoice(ctx context.Context, ref Ref, externalInvoiceID string) (Invoice, error) {
	start := time.Now()
	out, err := a.Adapter.GetInvoice(ctx, ref, externalInvoiceID)
	a.observe(ctx, "get_invoice", start, err)
	return out, err
}

func (a instrumented) VoidInvoice(ctx context.Context, ref Ref, externalInvoiceID string) error {
	start := time.Now()
	err := a.Adapter.VoidInvoice(ctx, ref, externalInvoiceID)
	a.observe(ctx, "void_invoice", start, err)
	return err
}

func (a instrumented) ListInvoiceEvents(ctx context.Context, ref Ref, cursor string, since time.Time) ([]Event, string, error) {
	start := time.Now()
	out, next, err := a.Adapter.ListInvoiceEvents(ctx, ref, cursor, since)
	a.observe(ctx, "list_events", start, err)
	return out, next, err
}

func (a instrumented) Pay(ctx context.Context, ref Ref, externalInvoiceID string, invoice NormalizedInvoice) (PaymentOutcome, error) {
	start := time.Now()
	out, err := a.Adapter.Pay(ctx, ref, externalInvoiceID, invoice)
	a.observe(ctx, "pay", start, err)
	return out, err
}

func (a instrumented) CreateSetupSession(ctx context.Context, ref Ref, session SetupSession) (SetupSessionLink, error) {
	start := time.Now()
	out, err := a.Adapter.CreateSetupSession(ctx, ref, session)
	a.observe(ctx, "create_setup_session", start, err)
	return out, err
}

func (a instrumented) GetSetupSession(ctx context.Context, ref Ref, sessionID string) (SetupSessionResult, error) {
	start := time.Now()
	out, err := a.Adapter.GetSetupSession(ctx, ref, sessionID)
	a.observe(ctx, "get_setup_session", start, err)
	return out, err
}

func (a instrumented) CreateBillingPortalSession(ctx context.Context, ref Ref, externalCustomerID, returnURL string) (string, error) {
	start := time.Now()
	out, err := a.Adapter.CreateBillingPortalSession(ctx, ref, externalCustomerID, returnURL)
	a.observe(ctx, "create_portal_session", start, err)
	return out, err
}

func (a instrumented) DetachPaymentMethod(ctx context.Context, ref Ref, externalPaymentMethodID string) error {
	start := time.Now()
	err := a.Adapter.DetachPaymentMethod(ctx, ref, externalPaymentMethodID)
	a.observe(ctx, "detach_payment_method", start, err)
	return err
}

func (a instrumented) DefaultPaymentMethod(ctx context.Context, ref Ref, externalCustomerID string) (*PaymentMethod, error) {
	start := time.Now()
	out, err := a.Adapter.DefaultPaymentMethod(ctx, ref, externalCustomerID)
	a.observe(ctx, "default_payment_method", start, err)
	return out, err
}

func (a instrumented) SetDefaultPaymentMethod(ctx context.Context, ref Ref, externalCustomerID, externalPaymentMethodID string) (PaymentMethod, error) {
	start := time.Now()
	out, err := a.Adapter.SetDefaultPaymentMethod(ctx, ref, externalCustomerID, externalPaymentMethodID)
	a.observe(ctx, "set_default_payment_method", start, err)
	return out, err
}

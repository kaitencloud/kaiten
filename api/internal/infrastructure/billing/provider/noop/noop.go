// Package noop is the provider of an organization that collects its invoices
// itself: nothing is pushed, invoices are issued MANUAL and handed off through
// the handoff queue, and a void is local.
package noop

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
)

// Adapter is the NOOP provider.
type Adapter struct{}

// New returns the NOOP provider.
func New() Adapter { return Adapter{} }

var _ provider.Adapter = Adapter{}

// Kind implements provider.Adapter.
func (Adapter) Kind() provider.Kind { return provider.KindNoop }

// Capabilities implements provider.Adapter: none.
func (Adapter) Capabilities() provider.Capabilities {
	return provider.Capabilities{
		PushesInvoices: false, EventFeed: false, ChargeAutomatically: false,
		PaymentMethodCapture: false, BillingPortal: false, Currencies: nil,
	}
}

// EnsureCustomer implements provider.Adapter: NOOP keeps no customer.
func (Adapter) EnsureCustomer(context.Context, provider.Ref, provider.Customer) (provider.CustomerRecord, error) {
	return provider.CustomerRecord{}, provider.ErrUnsupported
}

// FindInvoice implements provider.Adapter.
func (Adapter) FindInvoice(context.Context, provider.Ref, string, uuid.UUID) (*provider.Invoice, error) {
	return nil, provider.ErrUnsupported
}

// CreateDraft implements provider.Adapter.
func (Adapter) CreateDraft(context.Context, provider.Ref, provider.NormalizedInvoice) (provider.Invoice, error) {
	return provider.Invoice{}, provider.ErrUnsupported
}

// AddLine implements provider.Adapter.
func (Adapter) AddLine(context.Context, provider.Ref, string, provider.NormalizedInvoice, provider.NormalizedLine) (string, error) {
	return "", provider.ErrUnsupported
}

// Finalize implements provider.Adapter.
func (Adapter) Finalize(context.Context, provider.Ref, string, provider.NormalizedInvoice) (provider.Invoice, error) {
	return provider.Invoice{}, provider.ErrUnsupported
}

// GetInvoice implements provider.Adapter.
func (Adapter) GetInvoice(context.Context, provider.Ref, string) (provider.Invoice, error) {
	return provider.Invoice{}, provider.ErrUnsupported
}

// VoidInvoice implements provider.Adapter: a NOOP void is local.
func (Adapter) VoidInvoice(context.Context, provider.Ref, string) error { return nil }

// ListInvoiceEvents implements provider.Adapter.
func (Adapter) ListInvoiceEvents(context.Context, provider.Ref, string, time.Time) ([]provider.Event, string, error) {
	return nil, "", provider.ErrUnsupported
}

// CreateSetupSession implements provider.Adapter.
func (Adapter) CreateSetupSession(context.Context, provider.Ref, provider.SetupSession) (provider.SetupSessionLink, error) {
	return provider.SetupSessionLink{}, provider.ErrUnsupported
}

// GetSetupSession implements provider.Adapter.
func (Adapter) GetSetupSession(context.Context, provider.Ref, string) (provider.SetupSessionResult, error) {
	return provider.SetupSessionResult{}, provider.ErrUnsupported
}

// CreateBillingPortalSession implements provider.Adapter.
func (Adapter) CreateBillingPortalSession(context.Context, provider.Ref, string, string) (string, error) {
	return "", provider.ErrUnsupported
}

// DetachPaymentMethod implements provider.Adapter.
func (Adapter) DetachPaymentMethod(context.Context, provider.Ref, string) error {
	return provider.ErrUnsupported
}

// Pay implements provider.Adapter: not supported.
func (Adapter) Pay(context.Context, provider.Ref, string, provider.NormalizedInvoice) (provider.PaymentOutcome, error) {
	return provider.PaymentOutcome{}, provider.ErrUnsupported
}

// DefaultPaymentMethod implements provider.Adapter: not supported.
func (Adapter) DefaultPaymentMethod(context.Context, provider.Ref, string) (*provider.PaymentMethod, error) {
	return nil, provider.ErrUnsupported
}

// SetDefaultPaymentMethod implements provider.Adapter: not supported.
func (Adapter) SetDefaultPaymentMethod(context.Context, provider.Ref, string, string) (provider.PaymentMethod, error) {
	return provider.PaymentMethod{}, provider.ErrUnsupported
}

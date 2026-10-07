// Package provider is the boundary between billing and the payment providers
// that issue and collect its invoices.
//
// Kaiten composes every invoice; a provider presents it, collects it and
// reports back. Billing talks to providers only through Adapter, with
// normalized types, and branches on Capabilities, never on a provider's kind,
// so a new provider is a new Adapter and nothing else. Each invoice records
// the provider that issued it, and every later operation on it (push, void,
// sync, reconciliation) routes there, whichever provider its subscription
// uses now.
//
// Rules every adapter keeps:
//   - Every mutating call is idempotent: jobs retry it. The idempotency key of
//     a push step derives from the Kaiten invoice id and the step.
//   - No call is made inside a database transaction. Billing persists its
//     intent, calls, then persists the result in a separate transaction.
//   - Failures are returned as *Error with a Class, so billing maps them to
//     the same answers whatever the provider.
package provider

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// Kind names a provider, as invoices and subscriptions record it.
type Kind string

const (
	// KindNoop is no provider: the organization collects its invoices itself,
	// through the handoff queue.
	KindNoop Kind = "NOOP"
	// KindStripe is the Stripe connector.
	KindStripe Kind = "STRIPE"
)

// Capabilities are what a provider can do. Billing gates on them, never on
// Kind.
type Capabilities struct {
	// PushesInvoices: invoices are created, finalized and collected by the
	// provider. Without it, invoices are issued MANUAL and handed off.
	PushesInvoices bool
	// EventFeed: ListInvoiceEvents answers; sync reads changes from it.
	EventFeed bool
	// ChargeAutomatically: the provider charges a saved payment method.
	ChargeAutomatically bool
	// PaymentMethodCapture: hosted setup sessions.
	PaymentMethodCapture bool
	// BillingPortal: hosted customer portal sessions.
	BillingPortal bool
	// Currencies the provider accepts; empty accepts any.
	Currencies []string
	// RefusedCurrencies the provider cannot collect, whatever Currencies says.
	RefusedCurrencies []string
}

// AcceptsCurrency reports whether the provider accepts a currency.
func (c Capabilities) AcceptsCurrency(currency string) bool {
	for _, refused := range c.RefusedCurrencies {
		if refused == currency {
			return false
		}
	}
	if len(c.Currencies) == 0 {
		return true
	}
	for _, accepted := range c.Currencies {
		if accepted == currency {
			return true
		}
	}
	return false
}

// Ref is what an adapter needs to act for one organization: its id and its
// provider settings, resolved by the registry. Settings are never logged.
type Ref struct {
	OrganizationID uuid.UUID
	Settings       any
}

// Connection is a provider resolved for an organization.
type Connection struct {
	Adapter Adapter
	Ref     Ref
	// AutoFinalize: a pushed draft is finalized at once. Without it, the
	// draft waits in the provider for a human (review mode).
	AutoFinalize bool
	// InclusiveTax: the provider's tax is included in Kaiten's amounts, so
	// reconciliation compares its subtotal rather than its total excluding
	// tax.
	InclusiveTax bool
	// Livemode: the connection reaches the provider's live account rather
	// than a test one.
	Livemode bool
}

// Adapter is the surface every provider implements. Push is split in steps
// so that billing persists each step's provider id before the next call, and
// a retry resumes where the last attempt stopped: never a second provider
// invoice, never a second item for a line.
type Adapter interface {
	Kind() Kind
	Capabilities() Capabilities

	// EnsureCustomer creates the provider's customer, or updates the one
	// external names (its e-mail), and returns it.
	EnsureCustomer(ctx context.Context, ref Ref, customer Customer) (CustomerRecord, error)

	// FindInvoice finds the provider invoice created for a Kaiten invoice by
	// an earlier attempt whose answer was lost; nil when there is none.
	FindInvoice(ctx context.Context, ref Ref, externalCustomerID string, kaitenInvoiceID uuid.UUID) (*Invoice, error)
	// CreateDraft creates the provider's draft for an invoice.
	CreateDraft(ctx context.Context, ref Ref, invoice NormalizedInvoice) (Invoice, error)
	// AddLine adds one line to a draft and returns the provider's line id.
	AddLine(ctx context.Context, ref Ref, externalInvoiceID string, invoice NormalizedInvoice, line NormalizedLine) (string, error)
	// Finalize issues a draft.
	Finalize(ctx context.Context, ref Ref, externalInvoiceID string, invoice NormalizedInvoice) (Invoice, error)
	// GetInvoice reads an invoice by id, with its lines. A deleted draft
	// answers an *Error of ClassNotFound.
	GetInvoice(ctx context.Context, ref Ref, externalInvoiceID string) (Invoice, error)
	// VoidInvoice voids an issued invoice, or deletes a draft. An invoice
	// already void or deleted is a success.
	VoidInvoice(ctx context.Context, ref Ref, externalInvoiceID string) error
	// ListInvoiceEvents reads the change feed from cursor (empty: from since),
	// oldest first, and returns the cursor to resume from.
	ListInvoiceEvents(ctx context.Context, ref Ref, cursor string, since time.Time) ([]Event, string, error)

	// Pay charges an issued invoice to the customer's saved payment method,
	// off-session (ChargeAutomatically). A declined or unauthenticated charge
	// is an outcome, not an error; an error means the outcome is unknown, and
	// the same call is retried.
	Pay(ctx context.Context, ref Ref, externalInvoiceID string, invoice NormalizedInvoice) (PaymentOutcome, error)

	// CreateSetupSession, GetSetupSession, CreateBillingPortalSession,
	// DetachPaymentMethod and the default payment method serve automatic
	// collection; a provider without the capability answers ErrUnsupported.
	CreateSetupSession(ctx context.Context, ref Ref, session SetupSession) (SetupSessionLink, error)
	GetSetupSession(ctx context.Context, ref Ref, sessionID string) (SetupSessionResult, error)
	CreateBillingPortalSession(ctx context.Context, ref Ref, externalCustomerID, returnURL string) (string, error)
	DetachPaymentMethod(ctx context.Context, ref Ref, externalPaymentMethodID string) error
	// DefaultPaymentMethod is the payment method the provider charges the
	// customer with; nil when there is none.
	DefaultPaymentMethod(ctx context.Context, ref Ref, externalCustomerID string) (*PaymentMethod, error)
	// SetDefaultPaymentMethod makes a payment method attached to the
	// customer the one charged, and returns it.
	SetDefaultPaymentMethod(ctx context.Context, ref Ref, externalCustomerID, externalPaymentMethodID string) (PaymentMethod, error)
}

// PaymentMethod is a saved payment method as Kaiten shows it: labels only,
// never card data.
type PaymentMethod struct {
	ExternalID string
	Brand      string
	Last4      string
	ExpMonth   int
	ExpYear    int
}

// PaymentStatus is the outcome of an automatic charge.
type PaymentStatus string

const (
	// PaymentPaid: the invoice is settled.
	PaymentPaid PaymentStatus = "paid"
	// PaymentFailed: the charge was declined, or there was nothing to charge.
	PaymentFailed PaymentStatus = "failed"
	// PaymentRequiresAction: the customer must authenticate (3-D Secure)
	// on the provider's hosted page.
	PaymentRequiresAction PaymentStatus = "requires_action"
)

// Codes of a failed charge billing treats on their own.
const (
	PaymentCodeAuthenticationRequired = "authentication_required"
	PaymentCodeExpiredCard            = "expired_card"
	PaymentCodeNoPaymentMethod        = "no_payment_method"
)

// PaymentOutcome is what an automatic charge did.
type PaymentOutcome struct {
	Status PaymentStatus
	// Code is the provider's failure or decline code; empty when paid.
	Code string
	// Invoice is the invoice after the charge.
	Invoice Invoice
}

// Customer is a Kaiten customer as a provider is told about it.
type Customer struct {
	CustomerID uuid.UUID
	// ExternalID is the provider's id, when Kaiten has one already.
	ExternalID string
	Name       string
	Email      string
	Metadata   map[string]string
	// RecreateOf is the provider id of a customer that was deleted in the
	// provider. Set, the adapter creates a new customer, under an idempotency
	// key of its own so that it is not answered with the deleted one.
	RecreateOf string
}

// CustomerRecord is the provider's customer.
type CustomerRecord struct {
	ExternalID string
	WebURL     string
}

// NormalizedInvoice is a Kaiten invoice as a provider receives it. Every
// member derives from the frozen invoice row, so a retry sends the same.
type NormalizedInvoice struct {
	KaitenInvoiceID    uuid.UUID
	ExternalCustomerID string
	Kind               string
	BoundaryAt         time.Time
	Currency           string
	CollectionMethod   string
	// DaysUntilDue applies to SEND_INVOICE.
	DaysUntilDue *int32
	Lines        []NormalizedLine
	TotalMinor   int64
	Metadata     map[string]string
}

// NormalizedLine is one invoice line: an amount, negative for a discount.
type NormalizedLine struct {
	LineID      uuid.UUID
	Seq         int
	AmountMinor int64
	Description string
	ServiceFrom time.Time
	ServiceTo   time.Time
}

// Status is a provider invoice's status, as Kaiten mirrors it.
type Status string

const (
	StatusDraft         Status = "draft"
	StatusOpen          Status = "open"
	StatusPaid          Status = "paid"
	StatusUncollectible Status = "uncollectible"
	StatusVoid          Status = "void"
)

// Invoice is a provider invoice as read back.
type Invoice struct {
	ExternalID         string
	ExternalCustomerID string
	KaitenInvoiceID    uuid.UUID
	Status             Status
	Number             string
	HostedURL          string
	PDFURL             string
	FinalizedAt        *time.Time
	PaidAt             *time.Time
	UncollectibleAt    *time.Time
	VoidedAt           *time.Time
	// AttemptCount counts the provider's collection attempts;
	// LastPaymentError is the latest one's failure code.
	AttemptCount     int
	LastPaymentError string
	// TotalExcludingTax and Subtotal are compared by reconciliation.
	TotalExcludingTax int64
	Subtotal          int64
	Currency          string
	Lines             []Line
}

// Line is a provider invoice line.
type Line struct {
	ExternalLineID string
	// KaitenLineID is the Kaiten line it was created for; uuid.Nil for a
	// line added in the provider.
	KaitenLineID uuid.UUID
	AmountMinor  int64
	Currency     string
}

// Event is one change in the provider's feed. Events are a change feed only:
// billing reads the invoice (or the customer) by id and applies that state,
// so an event seen twice or out of order is harmless.
type Event struct {
	ID                string
	Type              string
	CreatedAt         time.Time
	ExternalInvoiceID string
	// ExternalCustomerID is set on a customer's event (its payment method
	// changed); ExternalSessionID on a completed setup session.
	ExternalCustomerID string
	ExternalSessionID  string
}

// SetupSession asks for a hosted page saving a customer's payment method.
type SetupSession struct {
	ExternalCustomerID string
	Currency           string
	ReturnURL          string
	Metadata           map[string]string
}

// SetupSessionLink is a hosted setup page.
type SetupSessionLink struct {
	URL       string
	SessionID string
	ExpiresAt time.Time
}

// SetupSessionResult is a setup session's outcome.
type SetupSessionResult struct {
	Complete                bool
	ExternalCustomerID      string
	ExternalPaymentMethodID string
	// Metadata is what the session was created with (Kaiten's customer id).
	Metadata map[string]string
}

// ErrUnsupported is what an adapter answers for a call outside its
// capabilities.
var ErrUnsupported = errors.New("the billing provider does not support this operation")

// ErrNotConnected is what the registry answers for a provider the
// organization has not connected.
var ErrNotConnected = errors.New("the billing provider is not connected for this organization")

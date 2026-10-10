// Package invoices is what every use case that writes or reads an invoice
// shares: its API shapes, how a composition becomes an issued invoice, and
// the events an invoice records.
package invoices

import (
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/shared/nullable"
)

// Statuses, handoff states and kinds, as the API spells them.
const (
	StatusDraft         = "DRAFT"
	StatusManual        = "MANUAL"
	StatusPaid          = "PAID"
	StatusUncollectible = "UNCOLLECTIBLE"
	StatusVoid          = "VOID"

	HandoffNotRequired  = "NOT_REQUIRED"
	HandoffPending      = "PENDING"
	HandoffAcknowledged = "ACKNOWLEDGED"

	ProviderNoop = "NOOP"
)

// InvoiceSummary is an invoice without its lines: what a list returns.
type InvoiceSummary struct {
	ID               uuid.UUID  `json:"id" doc:"The invoice's identifier: the key an accounting system deduplicates on"`
	Kind             string     `json:"kind" enum:"ACTIVATION,RENEWAL,FINAL" doc:"ACTIVATION bills a subscription's first period, RENEWAL the period that ended and the one that starts, FINAL what is left when a subscription ends"`
	BoundaryAt       time.Time  `json:"boundaryAt" doc:"The boundary the invoice bills. With the kind, it identifies the invoice within its subscription"`
	ServiceFrom      time.Time  `json:"serviceFrom" doc:"Earliest start of its lines' service periods"`
	ServiceTo        time.Time  `json:"serviceTo" doc:"Latest end of its lines' service periods"`
	Status           string     `json:"status" enum:"DRAFT,PUSHED,PUSH_FAILED,MANUAL,PAID,PAYMENT_FAILED,UNCOLLECTIBLE,VOID" doc:"MANUAL: issued, for the organization to collect. PAID, UNCOLLECTIBLE and VOID are final. DRAFT: held, waiting for a release or a recompose"`
	HoldReason       *string    `json:"holdReason" enum:"LEDGER_SEQUENCE_GAP,LEDGER_CHAIN_BREAK,LEDGER_COUNTER_MISMATCH" doc:"Why a DRAFT is held: the usage journal it was measured from failed a consistency check"`
	ProviderKind     string     `json:"providerKind" enum:"NOOP,STRIPE" doc:"Who collects it. NOOP: the organization itself, through the handoff queue"`
	CollectionMethod string     `json:"collectionMethod" enum:"SEND_INVOICE,CHARGE_AUTOMATICALLY"`
	Currency         string     `json:"currency" example:"EUR"`
	Subtotal         int64      `json:"subtotal" doc:"Sum of the lines, in minor units"`
	DiscountTotal    int64      `json:"discountTotal" doc:"Sum of the discounts, in minor units"`
	Total            int64      `json:"total" doc:"subtotal − discountTotal, in minor units"`
	IssuedAt         *time.Time `json:"issuedAt"`
	DaysUntilDue     *int32     `json:"daysUntilDue"`
	DueAt            *time.Time `json:"dueAt" doc:"issuedAt + daysUntilDue"`
	PaidAt           *time.Time `json:"paidAt"`
	CustomerSlug     string     `json:"customerSlug" doc:"As it was when the invoice was composed"`
	CustomerName     string     `json:"customerName"`
	InstanceSlug     string     `json:"instanceSlug"`
	InstanceName     string     `json:"instanceName"`
	LicenseSlug      string     `json:"licenseSlug"`
	HandoffStatus    string     `json:"handoffStatus" enum:"NOT_REQUIRED,PENDING,ACKNOWLEDGED" doc:"PENDING: waiting in the handoff queue for the organization's accounting system"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}

// TransformSchema publishes InvoiceSummary's absent members as null (§13.15).
func (InvoiceSummary) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, InvoiceSummary{})
}

// Invoice is an invoice with its lines and everything that happened to it.
type Invoice struct {
	InvoiceSummary
	LicenseID           uuid.UUID            `json:"licenseId"`
	Lines               []rating.InvoiceLine `json:"lines" nullable:"false"`
	BillingEmail        *string              `json:"billingEmail" doc:"The address the invoice is for, as it was when composed. Personal data: it appears in no event"`
	HoldDetail          *HoldDetail          `json:"holdDetail" doc:"Every meter whose journal failed a check"`
	Hold                *HoldRecord          `json:"hold" doc:"When the invoice was held and released"`
	Handoff             InvoiceHandoff       `json:"handoff"`
	UncollectibleAt     *time.Time           `json:"uncollectibleAt"`
	VoidedAt            *time.Time           `json:"voidedAt"`
	VoidReason          *string              `json:"voidReason"`
	ReplacesInvoiceID   *uuid.UUID           `json:"replacesInvoiceId" doc:"The VOID invoice this one was recomposed from"`
	ReplacedByInvoiceID *uuid.UUID           `json:"replacedByInvoiceId" doc:"The invoice recomposed from this VOID one"`
	Provider            *ProviderRecord      `json:"provider" doc:"The invoice in its payment provider; null for NOOP"`
}

// TransformSchema publishes Invoice's absent members as null (§13.15).
func (Invoice) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, Invoice{})
}

// ProviderRecord is where an invoice stands in the payment provider that
// issues it.
type ProviderRecord struct {
	ExternalCustomerID    *string         `json:"externalCustomerId,omitempty"`
	ExternalInvoiceID     *string         `json:"externalInvoiceId,omitempty"`
	InvoiceNumber         *string         `json:"invoiceNumber,omitempty" doc:"The provider's invoice number"`
	Status                *string         `json:"status,omitempty" enum:"draft,open,paid,uncollectible,void" doc:"The provider's status, mirrored verbatim"`
	HostedInvoiceURL      *string         `json:"hostedInvoiceUrl,omitempty"`
	InvoicePDFURL         *string         `json:"invoicePdfUrl,omitempty"`
	PushAttempts          int32           `json:"pushAttempts"`
	NextPushAt            *time.Time      `json:"nextPushAt,omitempty" doc:"When the push queue tries it next; absent when it waits for a human (finalization in the provider) or is pushed"`
	LastPushError         *string         `json:"lastPushError,omitempty" doc:"The provider's code and message of the last failed push step"`
	LastPaymentError      *string         `json:"lastPaymentError,omitempty" doc:"Why the last automatic charge failed, as the provider coded it: authentication_required (the customer must confirm the payment on the hosted invoice page), card_declined, expired_card, no_payment_method..."`
	PushedAt              *time.Time      `json:"pushedAt,omitempty"`
	SyncedAt              *time.Time      `json:"syncedAt,omitempty"`
	TotalExcludingTax     *int64          `json:"totalExcludingTax,omitempty" doc:"The provider's total excluding tax, read back"`
	ReconciliationStatus  *string         `json:"reconciliationStatus,omitempty" enum:"MATCHED,MISMATCH"`
	ReconciledAt          *time.Time      `json:"reconciledAt,omitempty"`
	ReconciliationDetails *Reconciliation `json:"reconciliationDetail,omitempty" doc:"What differs, on a MISMATCH"`
}

// Reconciliation is what differs between an invoice and its provider's copy.
type Reconciliation struct {
	Lines             []LineDifference     `json:"lines" nullable:"false"`
	MissingInProvider []uuid.UUID          `json:"missingInProvider" nullable:"false" doc:"Kaiten lines the provider does not have"`
	ExtraInProvider   []string             `json:"extraInProvider" nullable:"false" doc:"Provider lines Kaiten does not have"`
	Discounts         []DiscountDifference `json:"discounts" nullable:"false" doc:"Allocations of DISCOUNT lines the provider applied with another amount, or not at all"`
	ExtraDiscounts    []ExtraDiscount      `json:"extraDiscounts" nullable:"false" doc:"Discounts the provider applied that Kaiten did not create, such as a coupon added in its dashboard"`
	Totals            TotalsDifference     `json:"totals"`
	InclusiveTax      bool                 `json:"inclusiveTax" doc:"Whether the provider's subtotal was compared, its tax being included in the amounts"`
	DueDate           *DueDateDifference   `json:"dueDate,omitempty" doc:"A SEND_INVOICE invoice the provider gives another due date than Kaiten's dueAt"`
}

// DueDateDifference is a due date the provider set apart from Kaiten's,
// further than DueDateTolerance (§12.4 rule 4). PAST_DUE keys on Kaiten's.
type DueDateDifference struct {
	KaitenDueAt   time.Time `json:"kaitenDueAt"`
	ProviderDueAt time.Time `json:"providerDueAt"`
}

// DiscountDifference is an allocation of a DISCOUNT line whose amount, on
// its target line in the provider, differs.
type DiscountDifference struct {
	LineID         uuid.UUID `json:"lineId" doc:"The DISCOUNT line"`
	Seq            int       `json:"seq"`
	TargetSeq      int       `json:"targetSeq"`
	KaitenAmount   int64     `json:"kaitenAmount"`
	ProviderAmount int64     `json:"providerAmount" doc:"0 when the provider did not apply it"`
	CouponID       string    `json:"couponId" doc:"The provider's discount, empty when none was recorded"`
}

// ExtraDiscount is a discount on a provider line that Kaiten did not create.
type ExtraDiscount struct {
	ExternalLineID string `json:"externalLineId"`
	DiscountID     string `json:"discountId"`
	Amount         int64  `json:"amount"`
}

// LineDifference is a line whose amounts differ.
type LineDifference struct {
	LineID         uuid.UUID `json:"lineId"`
	Seq            int       `json:"seq"`
	KaitenAmount   int64     `json:"kaitenAmount"`
	ProviderAmount int64     `json:"providerAmount"`
	ExternalLineID string    `json:"externalLineId"`
}

// TotalsDifference is the totals compared.
type TotalsDifference struct {
	KaitenTotal               int64  `json:"kaitenTotal"`
	ProviderTotalExcludingTax int64  `json:"providerTotalExcludingTax"`
	ProviderSubtotal          *int64 `json:"providerSubtotal,omitempty"`
	ProviderTotalDiscount     *int64 `json:"providerTotalDiscount,omitempty" doc:"With inclusive tax: the provider's discounts, already taken off its subtotal"`
}

// PushedInvoice is the payload of INSTANCE_INVOICE_PUSHED.
type PushedInvoice struct {
	InvoiceSummary
	ExternalInvoiceID     string  `json:"externalInvoiceId"`
	ProviderInvoiceNumber *string `json:"providerInvoiceNumber,omitempty"`
}

// PushFailedInvoice is the payload of INSTANCE_INVOICE_PUSH_FAILED.
type PushFailedInvoice struct {
	InvoiceSummary
	PushAttempts  int32  `json:"pushAttempts"`
	LastPushError string `json:"lastPushError" doc:"The provider's code and message, never a request body"`
}

// PaymentFailedInvoice is the payload of INSTANCE_INVOICE_PAYMENT_FAILED: an
// automatic charge refused, or waiting for the customer to authenticate. No
// card data.
type PaymentFailedInvoice struct {
	InvoiceSummary
	FailureCode    string `json:"failureCode" doc:"The provider's decline or failure code, such as card_declined, expired_card, authentication_required or no_payment_method"`
	RequiresAction bool   `json:"requiresAction" doc:"The customer must authenticate the payment on the invoice's hosted page"`
}

// MismatchedInvoice is the payload of INSTANCE_INVOICE_RECONCILIATION_MISMATCH.
type MismatchedInvoice struct {
	InvoiceSummary
	ReconciliationDetail Reconciliation `json:"reconciliationDetail"`
}

// HoldDetail lists the meters whose journal failed a check.
type HoldDetail struct {
	Pairs []HeldPair `json:"pairs" nullable:"false"`
}

// HeldPair is one meter whose journal failed a check.
type HeldPair struct {
	InstanceID    uuid.UUID `json:"instanceId"`
	EntitlementID uuid.UUID `json:"entitlementId"`
	ports.InvariantFailure
}

// HoldRecord is when an invoice was held, and released.
type HoldRecord struct {
	HeldAt        *time.Time `json:"heldAt,omitempty"`
	ReleasedAt    *time.Time `json:"releasedAt,omitempty"`
	ReleasedBy    *uuid.UUID `json:"releasedBy,omitempty" doc:"The user who released it; absent when it was released by a later check"`
	ReleaseReason *string    `json:"releaseReason,omitempty"`
}

// InvoiceHandoff is where an invoice stands in the handoff queue.
type InvoiceHandoff struct {
	Status            string     `json:"status" enum:"NOT_REQUIRED,PENDING,ACKNOWLEDGED"`
	LeaseID           *uuid.UUID `json:"leaseId,omitempty" doc:"The claim currently holding it"`
	LeasedUntil       *time.Time `json:"leasedUntil,omitempty"`
	ClaimCount        int32      `json:"claimCount"`
	AcknowledgedAt    *time.Time `json:"acknowledgedAt,omitempty"`
	ExternalReference *string    `json:"externalReference,omitempty" doc:"The invoice's number in the organization's accounting system"`
}

// IssuedInvoice is the payload of INSTANCE_INVOICE_ISSUED: the composed
// invoice, without its billing e-mail.
type IssuedInvoice struct {
	InvoiceSummary
	LicenseID      uuid.UUID            `json:"licenseId"`
	Lines          []rating.InvoiceLine `json:"lines" nullable:"false"`
	LinesTruncated bool                 `json:"linesTruncated,omitempty" doc:"Set when the lines did not fit the event: read the invoice for all of them"`
}

// PaidInvoice is the payload of INSTANCE_INVOICE_PAID.
type PaidInvoice struct {
	InvoiceSummary
	Source            string  `json:"source" enum:"MARK_PAID,PROVIDER,ZERO_TOTAL" doc:"MARK_PAID: recorded by the organization. ZERO_TOTAL: nothing was owed"`
	ExternalReference *string `json:"externalReference,omitempty"`
	Note              *string `json:"note,omitempty" doc:"The note given when it was marked paid, kept only here"`
}

// ReleasedInvoice is the payload of INSTANCE_INVOICE_RELEASED.
type ReleasedInvoice struct {
	InvoiceSummary
	ReleaseReason string     `json:"releaseReason"`
	ReleasedBy    string     `json:"releasedBy" doc:"The user who released it, or system when a later check found the journal sound"`
	HoldDetail    HoldDetail `json:"holdDetail" doc:"The hold it left, which the invoice no longer shows"`
}

// UncollectibleInvoice is the payload of INSTANCE_INVOICE_MARKED_UNCOLLECTIBLE.
type UncollectibleInvoice struct {
	InvoiceSummary
	Reason string `json:"reason"`
}

// VoidedInvoice is the payload of INSTANCE_INVOICE_VOIDED.
type VoidedInvoice struct {
	InvoiceSummary
	VoidReason string `json:"voidReason"`
}

// HandoffAcknowledgement is the payload of
// INSTANCE_INVOICE_HANDOFF_ACKNOWLEDGED.
type HandoffAcknowledgement struct {
	InvoiceID         uuid.UUID `json:"invoiceId"`
	ExternalReference *string   `json:"externalReference,omitempty" doc:"The invoice's number in the organization's accounting system"`
	AcknowledgedBy    uuid.UUID `json:"acknowledgedBy"`
}

// HeldInvoice is the payload of INSTANCE_INVOICE_HELD.
type HeldInvoice struct {
	InvoiceSummary
	HoldDetail HoldDetail `json:"holdDetail"`
}

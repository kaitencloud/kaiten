package checkout

import (
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/shared/nullable"
)

// TrialRefusedAlreadyConsumed is why a checkout went on without the
// licence's trial: a customer with the visitor's e-mail already consumed one
// of the family (INV-35).
const TrialRefusedAlreadyConsumed = "ALREADY_CONSUMED"

// Start statuses.
const (
	StartPreview = "preview"
	StartOpen    = "open"
)

// CheckoutSessionDraft is what a visitor's page starts a checkout with
// (§14.8). It names the price by priceId, or by licenseSlug with
// billingPeriod; exactly one of the two forms.
type CheckoutSessionDraft struct {
	TurnstileToken string     `json:"turnstileToken" minLength:"1" maxLength:"2048" doc:"The token the Turnstile widget gave the page. Single-use: a dryRun spends one too."`
	PriceID        *uuid.UUID `json:"priceId,omitempty" doc:"A FLAT_FEE price of a public plan. Not with licenseSlug and billingPeriod."`
	LicenseSlug    *string    `json:"licenseSlug,omitempty" maxLength:"255" doc:"A public plan's version, with billingPeriod: its default ACTIVE FLAT_FEE price of that period"`
	BillingPeriod  *string    `json:"billingPeriod,omitempty" doc:"MONTHLY, QUARTERLY, SEMI_ANNUAL or ANNUAL, with licenseSlug"`
	// AddOns are public add-ons that fit the plan.
	AddOns            []subscribeinstance.SubscriptionAddon `json:"addOns,omitempty" maxItems:"50"`
	VoucherCode       *string                               `json:"voucherCode,omitempty" maxLength:"64" doc:"A code to apply; any refusal answers 422 .VoucherInvalid"`
	Trial             *bool                                 `json:"trial,omitempty" doc:"false declines the licence's trial"`
	Email             *string                               `json:"email,omitempty" maxLength:"254" doc:"The buyer's e-mail. It becomes the new customer's billing e-mail at completion. Required unless dryRun."`
	ReturnURL         *string                               `json:"returnUrl,omitempty" maxLength:"2048" doc:"Where the payment-method setup page sends the visitor back, with kaiten_checkout_session=<sessionId> appended: https, or http on localhost, on an origin the key allows. Required unless dryRun."`
	ClientReferenceID *string                               `json:"clientReferenceId,omitempty" minLength:"1" maxLength:"255" doc:"The vendor's opaque reference, echoed on the checkout_session events"`
	DryRun            bool                                  `json:"dryRun,omitempty" doc:"Compute what would be due today, and write nothing"`
}

// CheckoutSessionStart is what the start answers: the session opened, or the
// preview of one.
type CheckoutSessionStart struct {
	Status                string            `json:"status" enum:"preview,open"`
	SessionID             *uuid.UUID        `json:"sessionId,omitempty" doc:"open only"`
	Token                 *string           `json:"token,omitempty" doc:"open only: the session's ksc_, returned once. Keep it in memory and sessionStorage, never in a URL."`
	ExpiresAt             *time.Time        `json:"expiresAt,omitempty" doc:"open only: 24 h after the start"`
	DueToday              sessions.DueToday `json:"dueToday"`
	TrialEndsAt           *time.Time        `json:"trialEndsAt" doc:"The end of the trial the subscription would start with; null without one"`
	TrialRefusedReason    *string           `json:"trialRefusedReason" doc:"ALREADY_CONSUMED: a customer with this e-mail already had a trial of the family, so none is given; null otherwise"`
	RequiresPaymentMethod bool              `json:"requiresPaymentMethod" doc:"Whether the confirm will send the visitor to a payment-method setup page"`
}

// SessionAddonSelection is an add-on a checkout session bought.
type SessionAddonSelection struct {
	AddonSlug string `json:"addonSlug"`
	Quantity  int32  `json:"quantity"`
}

// CheckoutPayment is how paying the session's ACTIVATION invoice went.
type CheckoutPayment struct {
	Status           string  `json:"status" enum:"paid,requires_action,failed,processing,not_required"`
	HostedInvoiceURL *string `json:"hostedInvoiceUrl"`
}

// CheckoutSession is one anonymous checkout as its ksc_ reads it (§14.8).
type CheckoutSession struct {
	SessionID             uuid.UUID                `json:"sessionId"`
	Status                string                   `json:"status" enum:"OPEN,AWAITING_PAYMENT,COMPLETED,ABANDONED,EXPIRED" doc:"A session still OPEN after expiresAt reads ABANDONED"`
	Email                 string                   `json:"email"`
	ClientReferenceID     *string                  `json:"clientReferenceId"`
	LicenseSlug           string                   `json:"licenseSlug"`
	BillingPeriod         string                   `json:"billingPeriod"`
	PriceID               uuid.UUID                `json:"priceId"`
	AddOns                []SessionAddonSelection  `json:"addOns" nullable:"false"`
	DueToday              sessions.DueToday        `json:"dueToday" doc:"The voucher's discount shows as a line; the code itself is never echoed"`
	TrialEndsAt           *time.Time               `json:"trialEndsAt"`
	TrialRefusedReason    *string                  `json:"trialRefusedReason"`
	RequiresPaymentMethod bool                     `json:"requiresPaymentMethod"`
	ExpiresAt             time.Time                `json:"expiresAt"`
	CustomerSlug          *string                  `json:"customerSlug" doc:"Set by the completion"`
	InstanceSlug          *string                  `json:"instanceSlug" doc:"Set by the completion"`
	ActivationInvoice     *sessions.SessionInvoice `json:"activationInvoice" doc:"Once an ACTIVATION was issued"`
	Payment               *CheckoutPayment         `json:"payment"`
	CreatedAt             time.Time                `json:"createdAt"`
	CompletedAt           *time.Time               `json:"completedAt"`
}

// Selection is the JSON a session stores of what its start priced: no
// foreign key, the completion re-validates it.
type Selection struct {
	AddOns  []SelectedAddon  `json:"addOns"`
	Voucher *SelectedVoucher `json:"voucher"`
	// TrialEndsAt is the end of the trial the start computed, kept so the
	// session reads it as it was priced.
	TrialEndsAt *time.Time `json:"trialEndsAt,omitempty"`
}

// SelectedAddon is an add-on of a selection.
type SelectedAddon struct {
	AddonID   uuid.UUID `json:"addonId"`
	AddonSlug string    `json:"addonSlug"`
	Quantity  int32     `json:"quantity"`
}

// SelectedVoucher is the voucher of a selection.
type SelectedVoucher struct {
	VoucherID uuid.UUID `json:"voucherId"`
	Code      string    `json:"code"`
}

// TransformSchema publishes the shapes' absent members as null (§13.15:
// member|null), the ones that reference another schema included.
func (CheckoutSessionStart) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, CheckoutSessionStart{})
}

func (CheckoutSession) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, CheckoutSession{})
}

func (CheckoutPayment) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullable.Pointers(s, CheckoutPayment{})
}

// Confirmation statuses.
const (
	ConfirmRequiresPaymentMethod = "requires_payment_method"
	ConfirmAwaitingPayment       = "awaiting_payment"
	ConfirmCompleted             = "completed"
)

// CheckoutConfirmation is what a confirm answers (§14.8).
type CheckoutConfirmation struct {
	Status         string          `json:"status" enum:"requires_payment_method,awaiting_payment,completed"`
	SetupURL       *string         `json:"setupUrl,omitempty" doc:"requires_payment_method only: the hosted page that saves the payment method"`
	SetupExpiresAt *time.Time      `json:"setupExpiresAt,omitempty" doc:"requires_payment_method only"`
	Session        CheckoutSession `json:"session"`
}

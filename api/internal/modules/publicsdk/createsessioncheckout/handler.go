// Package createsessioncheckout is the self-serve checkout of the public SDK
// surface (§14.4): a vendor's customer, through a customer session bound to
// one of its instances, subscribes that instance to a public licence price --
// with add-ons and a voucher -- in one call.
//
// The checkout is the vendor's subscribe, made on the customer's behalf. It
// adds what a browser needs and a vendor backend does not:
//
//   - only what the public catalogue offers may be bought: the price of a
//     public family's default version, the add-ons of public families that fit
//     it (rule 1);
//   - the instance is moved to that price's version in the subscribe's
//     transaction (rule 2);
//   - a paid plan is charged automatically, so a payment method is captured
//     first when the customer has none and something is due today, or the plan
//     requires one (rule 3): the call answers a hosted setup page, and the
//     browser calls again with its session id once the customer is back;
//   - totals come from the server: a dry run is the subscribe itself, rolled
//     back, so the preview is what the checkout bills (rule 11);
//   - the ACTIVATION invoice is pushed and charged before the answer, whose
//     payment status is read from the invoice as persisted (rule 9).
package createsessioncheckout

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/completepaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getcustomerbilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "CreateSessionCheckout"

// Statuses a checkout answers with.
const (
	StatusPreview               = "preview"
	StatusRequiresPaymentMethod = "requires_payment_method"
	StatusSubscribed            = "subscribed"
)

// Payment statuses (§14.4 rule 9).
const (
	PaymentPaid           = "paid"
	PaymentRequiresAction = "requires_action"
	PaymentFailed         = "failed"
	PaymentProcessing     = "processing"
	PaymentNotRequired    = "not_required"
)

const (
	sendInvoice         = "SEND_INVOICE"
	chargeAutomatically = "CHARGE_AUTOMATICALLY"
	authRequired        = "authentication_required"
)

// Session is the customer session a checkout runs for, as the facade hands
// it over.
type Session struct {
	CustomerSlug   string
	InstanceSlug   *string
	AllowedOrigins []string
}

// SessionCheckoutOrder is a checkout.
type SessionCheckoutOrder struct {
	LicensePriceID uuid.UUID                             `json:"licensePriceId" doc:"An ACTIVE flat-fee price of a plan in the public catalogue. The instance is moved to that price's version when it is on another one."`
	AddOns         []subscribeinstance.SubscriptionAddon `json:"addOns,omitempty" maxItems:"50" doc:"Public add-ons that fit the plan"`
	VoucherCode    *string                               `json:"voucherCode,omitempty" minLength:"1" maxLength:"64" doc:"Validated and redeemed in the checkout; any refusal answers .VoucherInvalid"`
	BillingEmail   *string                               `json:"billingEmail,omitempty" maxLength:"254" doc:"Where invoices go. Required when the customer has none; stored on the customer when given."`
	Trial          *bool                                 `json:"trial,omitempty" doc:"false skips the plan's trial. Omitted: the plan's trial, if it has one."`
	SetupSessionID *string                               `json:"setupSessionId,omitempty" doc:"The setupSessionId a requires_payment_method answer gave, once the customer is back from the setup page: the payment method saved there is checked with the provider and used."`
	ReturnURL      *string                               `json:"returnUrl,omitempty" format:"uri" doc:"Where the setup page sends the customer back, with kaiten_setup_session appended. Required when a payment method has to be captured. Its origin must be one the organization's publishable keys allow."`
	DryRun         bool                                  `json:"dryRun,omitempty" doc:"Answer what the checkout would bill today, and change nothing"`
}

// SessionCheckout is a checkout's answer: a preview, a setup page to send the
// customer to, or the subscription started.
type SessionCheckout struct {
	Status string `json:"status" enum:"preview,requires_payment_method,subscribed"`

	// preview
	DueToday    *DueToday  `json:"dueToday,omitempty" doc:"preview: what the checkout bills today; zero, with no lines, during a trial"`
	TrialEndsAt *time.Time `json:"trialEndsAt,omitempty" doc:"preview: when the trial would end, if there is one"`

	// requires_payment_method
	SetupURL       *string    `json:"setupUrl,omitempty" doc:"requires_payment_method: the provider's page where the customer saves a payment method"`
	SetupSessionID *string    `json:"setupSessionId,omitempty" doc:"requires_payment_method: send it back as setupSessionId once the customer returns"`
	ExpiresAt      *time.Time `json:"expiresAt,omitempty" doc:"requires_payment_method: when the setup page expires"`

	// subscribed
	Subscription      *sessions.SessionSubscription `json:"subscription,omitempty" doc:"subscribed: the subscription started"`
	ActivationInvoice *sessions.SessionInvoice      `json:"activationInvoice,omitempty" doc:"subscribed: the invoice of the first period; absent during a trial"`
	Payment           *Payment                      `json:"payment,omitempty" doc:"subscribed: how paying the activation invoice went"`
}

// DueToday is what a checkout bills today.
type DueToday struct {
	Currency      string                 `json:"currency" example:"EUR"`
	Subtotal      int64                  `json:"subtotal" doc:"Minor units"`
	DiscountTotal int64                  `json:"discountTotal" doc:"Minor units"`
	Total         int64                  `json:"total" doc:"Minor units"`
	Lines         []sessions.SessionLine `json:"lines" nullable:"false"`
}

// Payment is how paying the activation invoice went (§14.4 rule 9).
type Payment struct {
	Status           string  `json:"status" enum:"paid,requires_action,failed,processing,not_required" doc:"paid. requires_action: the customer must confirm the payment on hostedInvoiceUrl. failed: the charge was refused; save another payment method, or pay on hostedInvoiceUrl. processing: the outcome is not known yet; poll GET /public/session/invoices. not_required: nothing is due today."`
	HostedInvoiceURL *string `json:"hostedInvoiceUrl,omitempty"`
}

// The other modules' operations a checkout runs, through ports it owns.
type (
	Subscriber interface {
		Execute(ctx context.Context, instanceSlug string, cmd subscribeinstance.Command) (*subscribeinstance.StartedSubscription, error)
	}
	CustomerBillingReader interface {
		Execute(ctx context.Context, customerSlug string) (*getcustomerbilling.CustomerBilling, error)
	}
	SetupSessionOpener interface {
		Execute(ctx context.Context, customerSlug string, cmd createpaymentmethodsession.NewPaymentMethodSession) (*createpaymentmethodsession.PaymentMethodSession, error)
	}
	SetupSessionCompleter interface {
		Execute(ctx context.Context, customerSlug, sessionID string) (*completepaymentmethodsession.CompletedPaymentMethodSession, error)
	}
	InvoiceReader interface {
		Execute(ctx context.Context, invoiceID uuid.UUID) (*invoices.Invoice, error)
	}
	BillingEmailSetter interface {
		SetBillingEmail(ctx context.Context, customerSlug, email string) error
	}
)

// Deps is what a checkout needs.
type Deps struct {
	UserProvider    currentuser.Provider
	Catalog         *getpubliccatalog.UseCase
	Subscriber      Subscriber
	CustomerBilling CustomerBillingReader
	OpenSetup       SetupSessionOpener
	CompleteSetup   SetupSessionCompleter
	Invoices        InvoiceReader
	BillingEmails   BillingEmailSetter
}

type UseCase struct{ deps Deps }

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }

// Execute runs a checkout for the session's instance.
func (u *UseCase) Execute(ctx context.Context, session Session, request SessionCheckoutOrder) (*SessionCheckout, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	if session.InstanceSlug == nil {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InstanceRequired",
			"a checkout subscribes one instance: mint the session with an instanceSlug")
	}
	instanceSlug := *session.InstanceSlug
	if request.ReturnURL != nil && !sessions.AllowedReturn(*request.ReturnURL, session.AllowedOrigins) {
		return nil, invalidReturnURL()
	}

	// Rule 1: only what the public catalogue offers.
	catalog, err := u.deps.Catalog.Execute(ctx, user.OrganizationID, getpubliccatalog.Query{FamilySlug: nil, IncludeAddOns: true})
	if err != nil {
		return nil, err
	}
	plan, price, ok := find(catalog, request.LicensePriceID)
	if !ok {
		return nil, kaitenerrors.UnprocessableEntity(operation+".PriceNotPublic",
			"licensePriceId is not an ACTIVE price of a plan in the public catalogue")
	}
	if price.BillingModel != "FLAT_FEE" {
		return nil, kaitenerrors.UnprocessableEntity(operation+".PriceNotFlatFee",
			"a subscription is bought on a flat-fee price; metered prices come with it")
	}
	if plan.PricingType == "CUSTOM" {
		return nil, kaitenerrors.UnprocessableEntity(operation+".NotSelfServe",
			"this plan is priced on request: send the customer to its selfServeCtaUrl")
	}
	if err := checkAddOns(catalog, plan, request.AddOns); err != nil {
		return nil, err
	}
	providerKind, captures := u.deps.Catalog.CapturingProvider(ctx, user.OrganizationID)
	paid := plan.PricingType == "PAID"
	if paid && !captures {
		return nil, cannotCapture()
	}

	// Rule 6: where invoices go.
	billing, err := u.deps.CustomerBilling.Execute(ctx, session.CustomerSlug)
	if err != nil {
		return nil, translate(err)
	}
	email := ""
	if billing.BillingEmail != nil {
		email = *billing.BillingEmail
	}
	if request.BillingEmail != nil {
		if err := customerschema.ValidateBillingEmail(operation, *request.BillingEmail); err != nil {
			return nil, err
		}
		email = *request.BillingEmail
	}
	if email == "" {
		return nil, kaitenerrors.UnprocessableEntity(operation+".BillingEmailRequired",
			"the customer has no billing e-mail: send billingEmail")
	}

	licenseID, err := uuid.Parse(plan.LicenseID)
	if err != nil {
		return nil, err
	}
	base := subscribeinstance.Command{
		BasePriceID: request.LicensePriceID, ProviderKind: "", CollectionMethod: nil, DaysUntilDue: nil, StartAt: nil,
		TrialDays: nil, AddOns: request.AddOns, VoucherCode: request.VoucherCode,
		MoveToLicenseID: &licenseID, AllowMissingPaymentMethod: false, DryRun: false,
	}
	if request.Trial != nil && !*request.Trial {
		none := int32(0)
		base.TrialDays = &none
	}

	// Rule 11 and the totals of rule 3: the subscribe, rolled back. It bills
	// through no provider -- what it composes does not depend on one -- so a
	// preview reaches nothing outside the database.
	dry := base
	dry.ProviderKind, dry.CollectionMethod, dry.DryRun = "NOOP", ptr(sendInvoice), true
	preview, err := u.deps.Subscriber.Execute(ctx, instanceSlug, dry)
	if err != nil {
		return nil, translate(err)
	}
	due := dueToday(preview, price.Currency)
	if request.DryRun {
		return &SessionCheckout{Status: StatusPreview, DueToday: &due, TrialEndsAt: preview.TrialEndsAt}, nil
	}

	// Rule 3: a payment method first, when one is needed and missing.
	methodActive := activeMethod(billing, providerKind)
	needsMethod := due.Total > 0 || plan.RequiresPaymentMethod
	switch {
	case request.SetupSessionID != nil:
		if !captures {
			return nil, cannotCapture()
		}
		if _, err := u.deps.CompleteSetup.Execute(ctx, session.CustomerSlug, *request.SetupSessionID); err != nil {
			return nil, translate(err)
		}
		methodActive = true
	case needsMethod && !methodActive:
		if !captures {
			return nil, cannotCapture()
		}
		if request.ReturnURL == nil {
			return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidReturnUrl",
				"a payment method has to be saved first: send the returnUrl the setup page brings the customer back to")
		}
		currency := price.Currency
		link, err := u.deps.OpenSetup.Execute(ctx, session.CustomerSlug, createpaymentmethodsession.NewPaymentMethodSession{
			ReturnURL: *request.ReturnURL, Currency: &currency,
		})
		if err != nil {
			return nil, translate(err)
		}
		expires := link.ExpiresAt
		return &SessionCheckout{
			Status: StatusRequiresPaymentMethod, SetupURL: &link.URL, SetupSessionID: &link.SessionID, ExpiresAt: &expires,
		}, nil
	}

	if request.BillingEmail != nil && (billing.BillingEmail == nil || *billing.BillingEmail != email) {
		if err := u.deps.BillingEmails.SetBillingEmail(ctx, session.CustomerSlug, email); err != nil {
			return nil, translate(err)
		}
	}

	// The subscribe. A paid plan is charged automatically through the
	// provider that captured the payment method (rule 3); a free one is billed
	// through no provider (rule 5). Nothing due today and no card required
	// subscribes without one (rule 4).
	subscribe := base
	if paid {
		subscribe.ProviderKind, subscribe.CollectionMethod = providerKind, ptr(chargeAutomatically)
		subscribe.AllowMissingPaymentMethod = !needsMethod && !methodActive
	} else {
		subscribe.ProviderKind, subscribe.CollectionMethod = "NOOP", ptr(sendInvoice)
	}
	started, err := u.deps.Subscriber.Execute(ctx, instanceSlug, subscribe)
	if err != nil {
		return nil, translate(err)
	}

	subscription := sessions.SubscriptionFrom(started.InstanceBilling)
	out := &SessionCheckout{
		Status: StatusSubscribed, Subscription: &subscription,
		Payment: &Payment{Status: PaymentNotRequired, HostedInvoiceURL: nil},
	}
	if started.ActivationInvoice == nil {
		return out, nil
	}
	invoice, err := u.deps.Invoices.Execute(ctx, started.ActivationInvoice.ID)
	if err != nil {
		return nil, err
	}
	shown := sessions.InvoiceFrom(*invoice)
	out.ActivationInvoice = &shown
	out.Payment = paymentOf(*invoice)
	return out, nil
}

// find is the public plan and the ACTIVE price of it priceID names.
func find(catalog *getpubliccatalog.PublicCatalog, priceID uuid.UUID) (getpubliccatalog.PublicPlan, getpubliccatalog.PublicPrice, bool) {
	id := priceID.String()
	for _, plan := range catalog.Plans {
		for _, price := range plan.Prices {
			if price.ID == id {
				return plan, price, true
			}
		}
	}
	return getpubliccatalog.PublicPlan{}, getpubliccatalog.PublicPrice{}, false
}

// checkAddOns refuses an add-on the public catalogue does not offer with the
// plan, or more of one than it allows.
func checkAddOns(catalog *getpubliccatalog.PublicCatalog, plan getpubliccatalog.PublicPlan, wanted []subscribeinstance.SubscriptionAddon) error {
	for _, w := range wanted {
		i := slices.IndexFunc(catalog.AddOns, func(a getpubliccatalog.PublicAddOn) bool { return a.AddonSlug == w.AddonSlug })
		if i < 0 || !slices.Contains(catalog.AddOns[i].CompatibleLicenseFamilies, plan.FamilySlug) {
			return kaitenerrors.UnprocessableEntityf(operation+".AddonNotPublic",
				"%q is not a public add-on that fits this plan", w.AddonSlug)
		}
		if limit := catalog.AddOns[i].MaxQuantity; limit != nil && w.Quantity > *limit {
			return kaitenerrors.UnprocessableEntityf(operation+".QuantityExceedsMax",
				"at most %d of %q", *limit, w.AddonSlug)
		}
	}
	return nil
}

// dueToday is the preview's ACTIVATION invoice, or nothing due.
func dueToday(preview *subscribeinstance.StartedSubscription, currency string) DueToday {
	due := DueToday{Currency: currency, Subtotal: 0, DiscountTotal: 0, Total: 0, Lines: []sessions.SessionLine{}}
	if preview == nil || preview.Preview == nil {
		return due
	}
	shown := sessions.InvoiceFrom(*preview.Preview)
	due.Currency, due.Subtotal, due.DiscountTotal, due.Total, due.Lines =
		shown.Currency, shown.Subtotal, shown.DiscountTotal, shown.Total, shown.Lines
	return due
}

// activeMethod reports whether the customer has an ACTIVE payment method in
// the provider that would charge it.
func activeMethod(billing *getcustomerbilling.CustomerBilling, kind string) bool {
	for _, p := range billing.Providers {
		if p.ProviderKind == kind && p.PaymentMethod != nil && p.PaymentMethod.Status == "ACTIVE" {
			return true
		}
	}
	return false
}

// paymentOf derives the payment's status from the invoice as persisted.
func paymentOf(invoice invoices.Invoice) *Payment {
	var hosted, lastError *string
	if invoice.Provider != nil {
		hosted, lastError = invoice.Provider.HostedInvoiceURL, invoice.Provider.LastPaymentError
	}
	switch {
	case invoice.Total <= 0:
		return &Payment{Status: PaymentNotRequired, HostedInvoiceURL: nil}
	case invoice.Status == "PAID":
		return &Payment{Status: PaymentPaid, HostedInvoiceURL: hosted}
	case invoice.Status == "PAYMENT_FAILED" && lastError != nil && *lastError == authRequired:
		return &Payment{Status: PaymentRequiresAction, HostedInvoiceURL: hosted}
	case invoice.Status == "PAYMENT_FAILED":
		return &Payment{Status: PaymentFailed, HostedInvoiceURL: hosted}
	default:
		// DRAFT or PUSH_FAILED: the push did not finish in time; PUSHED: the
		// charge has no answer yet. The queue carries on either way.
		return &Payment{Status: PaymentProcessing, HostedInvoiceURL: hosted}
	}
}

// translate answers what the operations a checkout runs refuse as the
// checkout's own refusals, where the public contract names one (§14.4 rules
// 2, 3, 7, 8). Anything else passes through as it is.
func translate(err error) error {
	var refusal *kaitenerrors.Error
	if !errors.As(err, &refusal) {
		return err
	}
	switch refusal.Code {
	case "SubscribeInstance.AlreadySubscribed":
		return kaitenerrors.Conflict(operation+".AlreadySubscribed",
			"this instance already has a live subscription; a plan change is made by the vendor")
	case "SubscribeInstance.VoucherInvalid":
		// Opaque on purpose (rule 7): why a code is refused is not the browser's
		// to learn, one code at a time.
		return kaitenerrors.UnprocessableEntity(operation+".VoucherInvalid", "this voucher cannot be applied")
	case "SubscribeInstance.AddonInvalid":
		inner := ""
		if len(refusal.Errors) > 0 {
			if value, ok := refusal.Errors[0].Value.(map[string]any); ok {
				inner, _ = value["code"].(string)
			}
		}
		switch {
		case strings.HasSuffix(inner, ".QuantityExceedsMax"), strings.HasSuffix(inner, ".InvalidQuantity"):
			return kaitenerrors.UnprocessableEntityWithErrors(operation+".QuantityExceedsMax", refusal.Message, refusal.Errors...)
		case strings.HasSuffix(inner, ".CurrencyMismatch"):
			return kaitenerrors.UnprocessableEntityWithErrors(operation+".CurrencyMismatch", refusal.Message, refusal.Errors...)
		}
		return kaitenerrors.UnprocessableEntityWithErrors(operation+".AddonInvalid", refusal.Message, refusal.Errors...)
	case "SubscribeInstance.ProviderUnavailable", "CreatePaymentMethodSession.ProviderUnavailable",
		"CompletePaymentMethodSession.ProviderUnavailable":
		return kaitenerrors.Unavailable(operation+".ProviderUnavailable", "the payment provider could not be reached; retry in a moment")
	case "SubscribeInstance.ProviderNotConnected", "SubscribeInstance.CollectionMethodUnsupported",
		"SubscribeInstance.UnsupportedCurrency", "CreatePaymentMethodSession.ProviderNotConnected",
		"CompletePaymentMethodSession.ProviderNotConnected":
		return cannotCapture()
	case "CreatePaymentMethodSession.InvalidReturnUrl":
		return invalidReturnURL()
	case "CompletePaymentMethodSession.SessionNotFound", "CompletePaymentMethodSession.SessionNotComplete":
		return kaitenerrors.Conflict(operation+".SetupSessionIncomplete",
			"no payment method was saved on that setup page: send the customer back to it, or open a new one")
	case "UpdateInstance.LicenseArchived":
		return kaitenerrors.UnprocessableEntity(operation+".PriceNotPublic", "this plan's version is no longer on sale")
	}
	return err
}

func cannotCapture() error {
	return kaitenerrors.UnprocessableEntity(operation+".ProviderCannotCapturePayment",
		"this plan is paid, and the vendor has no payment provider that takes card payments")
}

func invalidReturnURL() error {
	return kaitenerrors.UnprocessableEntity(operation+".InvalidReturnUrl",
		"returnUrl must be an https URL on an origin the vendor's publishable keys allow")
}

func ptr[T any](v T) *T { return &v }

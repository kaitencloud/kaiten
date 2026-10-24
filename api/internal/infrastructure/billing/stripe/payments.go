package stripe

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"time"

	stripego "github.com/stripe/stripe-go/v87"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
)

// Automatic collection (CHARGE_AUTOMATICALLY): the invoice is charged
// off-session to the customer's default payment method, which the customer
// saved on a Stripe-hosted setup page. Kaiten never sees card data: it keeps
// the labels Stripe returns (brand, last four digits, expiry).

// requiresAction are the codes of a charge that needs the customer to
// authenticate (3-D Secure) on the hosted invoice page.
var requiresAction = map[string]bool{
	"invoice_payment_intent_requires_action": true,
	"authentication_required":                true,
}

// Pay implements provider.Adapter: it charges an open invoice once, under
// <invoice>:pay. A card refusal is an outcome; an error means the outcome is
// unknown, and the same call (same key) is retried. An invoice already paid,
// or a customer without a default payment method, answers without a charge.
func (a *Adapter) Pay(ctx context.Context, ref provider.Ref, externalInvoiceID string, in provider.NormalizedInvoice) (provider.PaymentOutcome, error) {
	sc, _, err := a.connect(ref)
	if err != nil {
		return provider.PaymentOutcome{}, err
	}
	current, err := sc.V1Invoices.Retrieve(ctx, externalInvoiceID, nil)
	if err != nil {
		return provider.PaymentOutcome{}, classify(err, objectInvoice)
	}
	switch current.Status {
	case stripego.InvoiceStatusPaid:
		read, err := a.read(ctx, sc, current)
		return provider.PaymentOutcome{Status: provider.PaymentPaid, Code: "", Invoice: read}, err
	case stripego.InvoiceStatusOpen:
	default:
		return provider.PaymentOutcome{}, &provider.Error{
			Class: provider.ClassRejected, Code: "invoice_" + string(current.Status), Param: "", RequestID: "",
			Message: "the Stripe invoice is " + string(current.Status) + " and cannot be charged",
		}
	}

	customerID := in.ExternalCustomerID
	if customerID == "" && current.Customer != nil {
		customerID = current.Customer.ID
	}
	method, err := a.defaultPaymentMethod(ctx, sc, customerID)
	if err != nil {
		return provider.PaymentOutcome{}, err
	}
	if method == nil {
		read, err := a.read(ctx, sc, current)
		return provider.PaymentOutcome{Status: provider.PaymentFailed, Code: provider.PaymentCodeNoPaymentMethod, Invoice: read}, err
	}

	// Reconciled and matched (§12.4 step 5): Stripe may now collect on its
	// own too, so its retries follow a failure.
	if !current.AutoAdvance {
		advance := &stripego.InvoiceUpdateParams{AutoAdvance: stripego.Bool(true)}
		advance.SetIdempotencyKey(in.KaitenInvoiceID.String() + ":auto_advance")
		if _, err := sc.V1Invoices.Update(ctx, externalInvoiceID, advance); err != nil {
			return provider.PaymentOutcome{}, classify(err, objectInvoice)
		}
	}
	params := &stripego.InvoicePayParams{OffSession: stripego.Bool(true)}
	params.SetIdempotencyKey(in.KaitenInvoiceID.String() + ":pay")
	paid, err := sc.V1Invoices.Pay(ctx, externalInvoiceID, params)
	if err == nil {
		read, err := a.read(ctx, sc, paid)
		if paid.Status != stripego.InvoiceStatusPaid {
			// Accepted, still open: its payment is processing (§12.6).
			return provider.PaymentOutcome{Status: provider.PaymentProcessing, Code: "", Invoice: read}, err
		}
		return provider.PaymentOutcome{Status: provider.PaymentPaid, Code: "", Invoice: read}, err
	}
	var stripeErr *stripego.Error
	if !errors.As(err, &stripeErr) || stripeErr.Type != stripego.ErrorTypeCard {
		return provider.PaymentOutcome{}, classify(err, objectInvoice)
	}
	outcome := provider.PaymentOutcome{Status: provider.PaymentFailed, Code: string(stripeErr.Code)}
	switch {
	case requiresAction[string(stripeErr.Code)]:
		outcome.Status, outcome.Code = provider.PaymentRequiresAction, provider.PaymentCodeAuthenticationRequired
	case stripeErr.Code == stripego.ErrorCodeExpiredCard || stripeErr.DeclineCode == stripego.DeclineCodeExpiredCard:
		outcome.Code = provider.PaymentCodeExpiredCard
	case stripeErr.DeclineCode != "":
		outcome.Code = string(stripeErr.DeclineCode)
	}
	after, err := sc.V1Invoices.Retrieve(ctx, externalInvoiceID, nil)
	if err != nil {
		return provider.PaymentOutcome{}, classify(err, objectInvoice)
	}
	read, err := a.read(ctx, sc, after)
	if err != nil {
		return provider.PaymentOutcome{}, err
	}
	outcome.Invoice = read
	return outcome, nil
}

// CreateSetupSession implements provider.Adapter: a Stripe Checkout Session
// in setup mode, which saves a payment method on the customer. The redirect
// back carries the session id; the session is checked server-side, never
// trusted from the redirect. With CustomerCreation there is no customer yet:
// Checkout creates it (customer_creation=always), with the e-mail given, and
// the return URL is the caller's as it is (§12.9 step 1).
func (a *Adapter) CreateSetupSession(ctx context.Context, ref provider.Ref, session provider.SetupSession) (provider.SetupSessionLink, error) {
	sc, _, err := a.connect(ref)
	if err != nil {
		return provider.SetupSessionLink{}, err
	}
	params := &stripego.CheckoutSessionCreateParams{
		Mode:                     stripego.String("setup"),
		Currency:                 stripego.String(strings.ToLower(session.Currency)),
		SuccessURL:               stripego.String(withSessionID(session.ReturnURL)),
		CancelURL:                stripego.String(session.ReturnURL),
		BillingAddressCollection: stripego.String("required"),
		// The customer's tax id, address and name, which automatic tax and the
		// invoices need, are saved on the Stripe customer (§12.5).
		TaxIDCollection: &stripego.CheckoutSessionCreateTaxIDCollectionParams{Enabled: stripego.Bool(true)},
		Metadata:        session.Metadata,
	}
	if session.CustomerCreation {
		// customer_update is accepted only with customer: what is collected is
		// saved on the customer Checkout creates.
		params.CustomerCreation = stripego.String("always")
		params.CustomerEmail = stripego.String(session.CustomerEmail)
		params.SuccessURL = stripego.String(session.ReturnURL)
	} else {
		params.Customer = stripego.String(session.ExternalCustomerID)
		params.CustomerUpdate = &stripego.CheckoutSessionCreateCustomerUpdateParams{
			Address: stripego.String("auto"), Name: stripego.String("auto"),
		}
	}
	if !session.ExpiresAt.IsZero() {
		params.ExpiresAt = stripego.Int64(session.ExpiresAt.Unix())
	}
	if session.IdempotencyKey != "" {
		params.SetIdempotencyKey(session.IdempotencyKey)
	}
	created, err := sc.V1CheckoutSessions.Create(ctx, params)
	if err != nil {
		return provider.SetupSessionLink{}, classify(err, objectCustomer)
	}
	return provider.SetupSessionLink{URL: created.URL, SessionID: created.ID, ExpiresAt: time.Unix(created.ExpiresAt, 0).UTC()}, nil
}

// StampCustomer implements provider.Adapter: the metadata is merged into the
// customer's.
func (a *Adapter) StampCustomer(ctx context.Context, ref provider.Ref, externalCustomerID string, metadata map[string]string, idempotencyKey string) error {
	sc, _, err := a.connect(ref)
	if err != nil {
		return err
	}
	params := &stripego.CustomerUpdateParams{Metadata: metadata}
	if idempotencyKey != "" {
		params.SetIdempotencyKey(idempotencyKey)
	}
	if _, err := sc.V1Customers.Update(ctx, externalCustomerID, params); err != nil {
		return classify(err, objectCustomer)
	}
	return nil
}

// withSessionID appends Stripe's session placeholder to the return URL.
func withSessionID(returnURL string) string {
	separator := "?"
	if parsed, err := url.Parse(returnURL); err == nil && parsed.RawQuery != "" {
		separator = "&"
	}
	return returnURL + separator + "kaiten_setup_session={CHECKOUT_SESSION_ID}"
}

// GetSetupSession implements provider.Adapter.
func (a *Adapter) GetSetupSession(ctx context.Context, ref provider.Ref, sessionID string) (provider.SetupSessionResult, error) {
	sc, _, err := a.connect(ref)
	if err != nil {
		return provider.SetupSessionResult{}, err
	}
	params := &stripego.CheckoutSessionRetrieveParams{}
	params.AddExpand("setup_intent")
	session, err := sc.V1CheckoutSessions.Retrieve(ctx, sessionID, params)
	if err != nil {
		return provider.SetupSessionResult{}, classify(err, objectInvoice)
	}
	out := provider.SetupSessionResult{
		Metadata: session.Metadata, Expired: session.Status == stripego.CheckoutSessionStatusExpired,
		URL: session.URL, ExpiresAt: time.Unix(session.ExpiresAt, 0).UTC(),
	}
	if session.Customer != nil {
		out.ExternalCustomerID = session.Customer.ID
	}
	if intent := session.SetupIntent; intent != nil {
		if intent.PaymentMethod != nil {
			out.ExternalPaymentMethodID = intent.PaymentMethod.ID
		}
		out.Complete = session.Status == stripego.CheckoutSessionStatusComplete &&
			intent.Status == stripego.SetupIntentStatusSucceeded && out.ExternalPaymentMethodID != ""
	}
	return out, nil
}

// CreateBillingPortalSession implements provider.Adapter: Stripe's hosted
// portal, where the customer manages payment methods and invoices.
func (a *Adapter) CreateBillingPortalSession(ctx context.Context, ref provider.Ref, externalCustomerID, returnURL string) (string, error) {
	sc, _, err := a.connect(ref)
	if err != nil {
		return "", err
	}
	session, err := sc.V1BillingPortalSessions.Create(ctx, &stripego.BillingPortalSessionCreateParams{
		Customer: stripego.String(externalCustomerID), ReturnURL: stripego.String(returnURL),
	})
	if err != nil {
		return "", classify(err, objectCustomer)
	}
	return session.URL, nil
}

// DetachPaymentMethod implements provider.Adapter. A payment method already
// detached, or unknown, is a success.
func (a *Adapter) DetachPaymentMethod(ctx context.Context, ref provider.Ref, externalPaymentMethodID string) error {
	sc, _, err := a.connect(ref)
	if err != nil {
		return err
	}
	if _, err := sc.V1PaymentMethods.Detach(ctx, externalPaymentMethodID, nil); err != nil && !isMissing(err) {
		return classify(err, objectNone)
	}
	return nil
}

// DefaultPaymentMethod implements provider.Adapter.
func (a *Adapter) DefaultPaymentMethod(ctx context.Context, ref provider.Ref, externalCustomerID string) (*provider.PaymentMethod, error) {
	sc, _, err := a.connect(ref)
	if err != nil {
		return nil, err
	}
	return a.defaultPaymentMethod(ctx, sc, externalCustomerID)
}

func (a *Adapter) defaultPaymentMethod(ctx context.Context, sc *stripego.Client, externalCustomerID string) (*provider.PaymentMethod, error) {
	params := &stripego.CustomerRetrieveParams{}
	params.AddExpand("invoice_settings.default_payment_method")
	customer, err := sc.V1Customers.Retrieve(ctx, externalCustomerID, params)
	if err != nil {
		return nil, classify(err, objectCustomer)
	}
	if customer.Deleted {
		return nil, &provider.Error{
			Class: provider.ClassCustomerMissing, Code: "customer_deleted", Param: "", RequestID: "",
			Message: "the Stripe customer was deleted",
		}
	}
	if customer.InvoiceSettings == nil || customer.InvoiceSettings.DefaultPaymentMethod == nil || customer.InvoiceSettings.DefaultPaymentMethod.ID == "" {
		return nil, nil
	}
	method := labels(customer.InvoiceSettings.DefaultPaymentMethod)
	if method.Brand == "" && method.Last4 == "" {
		// Not expanded: read it.
		full, err := sc.V1PaymentMethods.Retrieve(ctx, method.ExternalID, nil)
		if err != nil {
			return nil, classify(err, objectNone)
		}
		method = labels(full)
	}
	return &method, nil
}

// SetDefaultPaymentMethod implements provider.Adapter: the payment method,
// attached to the customer, becomes the one Stripe charges invoices to.
func (a *Adapter) SetDefaultPaymentMethod(ctx context.Context, ref provider.Ref, externalCustomerID, externalPaymentMethodID string) (provider.PaymentMethod, error) {
	sc, _, err := a.connect(ref)
	if err != nil {
		return provider.PaymentMethod{}, err
	}
	method, err := sc.V1PaymentMethods.Retrieve(ctx, externalPaymentMethodID, nil)
	if err != nil {
		return provider.PaymentMethod{}, classify(err, objectNone)
	}
	if method.Customer == nil || method.Customer.ID != externalCustomerID {
		return provider.PaymentMethod{}, &provider.Error{
			Class: provider.ClassRejected, Code: "payment_method_not_attached", Param: "", RequestID: "",
			Message: "the payment method is not attached to the customer",
		}
	}
	params := &stripego.CustomerUpdateParams{
		InvoiceSettings: &stripego.CustomerUpdateInvoiceSettingsParams{DefaultPaymentMethod: stripego.String(externalPaymentMethodID)},
	}
	params.SetIdempotencyKey(ref.OrganizationID.String() + ":" + externalCustomerID + ":default:" + externalPaymentMethodID)
	if _, err := sc.V1Customers.Update(ctx, externalCustomerID, params); err != nil {
		return provider.PaymentMethod{}, classify(err, objectCustomer)
	}
	return labels(method), nil
}

func labels(method *stripego.PaymentMethod) provider.PaymentMethod {
	out := provider.PaymentMethod{ExternalID: method.ID}
	if card := method.Card; card != nil {
		out.Brand, out.Last4 = string(card.Brand), card.Last4
		out.ExpMonth, out.ExpYear = int(card.ExpMonth), int(card.ExpYear)
	}
	return out
}

// eventOf maps a Stripe event to the provider's change feed: an invoice's,
// a customer's (its payment method changed) or a completed setup session's.
func eventOf(event *stripego.Event) provider.Event {
	out := provider.Event{ID: event.ID, Type: string(event.Type), CreatedAt: time.Unix(event.Created, 0).UTC()}
	if event.Data == nil {
		return out
	}
	object := event.Data.Object
	id, _ := object["id"].(string)
	switch kind, _ := object["object"].(string); kind {
	case "invoice":
		out.ExternalInvoiceID = id
	case "customer":
		out.ExternalCustomerID = id
	case "checkout.session":
		out.ExternalSessionID = id
		out.ExternalCustomerID, _ = object["customer"].(string)
		// An anonymous checkout's setup names its checkout session and its
		// organization, which select the event for the sync backstop (§12.6
		// rule 4); nothing else is read from them.
		if metadata, ok := object["metadata"].(map[string]any); ok {
			out.CheckoutSessionID, _ = metadata["kaiten_checkout_session_id"].(string)
			out.OrganizationID, _ = metadata["kaiten_organization_id"].(string)
		}
	case "payment_method":
		out.ExternalCustomerID, _ = event.Data.PreviousAttributes["customer"].(string)
		if customer, ok := object["customer"].(string); ok && customer != "" {
			out.ExternalCustomerID = customer
		}
	}
	return out
}

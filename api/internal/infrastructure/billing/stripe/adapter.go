// Package stripe is the Stripe payment provider: it pushes the invoices Kaiten
// composes to the organization's Stripe account, which issues, presents and
// collects them, and reads back what Stripe reports.
//
// It is the only package that may import stripe-go (an architecture test
// enforces it). Every call goes to the organization's own account with its
// restricted key; the key never reaches a log, an error or an event.
//
// Every mutating call carries an idempotency key derived from the Kaiten
// invoice (or customer) and the step, so a retry within Stripe's 24-hour key
// horizon is replayed by Stripe, and one beyond it resumes from the ids billing
// persisted: FindInvoice adopts a draft whose answer was lost, and Finalize
// reads the invoice first and applies a finalization that already happened.
package stripe

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	stripego "github.com/stripe/stripe-go/v87"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
)

// RefusedCurrencies are the currencies on Stripe's special-case list, and the
// three-decimal ones, whose minor units do not map onto Stripe's amounts at
// tolerance 0 (§8.5 rule 6). To be confirmed by the Stripe sandbox spike.
var RefusedCurrencies = []string{"BHD", "HUF", "ISK", "JOD", "KWD", "OMR", "TND", "TWD", "UGX"}

// invoiceEvents are the event types sync reads.
var invoiceEvents = []string{
	"invoice.finalized", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required",
	"invoice.voided", "invoice.marked_uncollectible", "invoice.deleted",
	"checkout.session.completed", "customer.updated", "payment_method.detached",
}

// firstPassLookback bounds the first read of the event feed, when there is
// no cursor yet: sync's first pass also reads every open invoice by id.
const firstPassLookback = 24 * time.Hour

// Options configure the adapter.
type Options struct {
	// BaseURL replaces Stripe's API URL (tests point it at stripefake).
	BaseURL string
	// HTTPClient replaces the default client.
	HTTPClient *http.Client
	// SendAfterFinalize e-mails a SEND_INVOICE invoice right after its
	// finalization, for accounts where an API finalization does not.
	SendAfterFinalize bool
	// Now is the adapter's clock; time.Now when nil.
	Now func() time.Time
}

// Adapter is the Stripe provider.
type Adapter struct {
	opts Options
}

// New returns the Stripe adapter.
func New(opts Options) *Adapter {
	if opts.Now == nil {
		opts.Now = time.Now
	}
	return &Adapter{opts: opts}
}

var (
	_ provider.Adapter           = (*Adapter)(nil)
	_ provider.CredentialChecker = (*Adapter)(nil)
	_ provider.AccountVerifier   = (*Adapter)(nil)
)

// Kind implements provider.Adapter.
func (*Adapter) Kind() provider.Kind { return provider.KindStripe }

// Capabilities implements provider.Adapter.
func (*Adapter) Capabilities() provider.Capabilities {
	return provider.Capabilities{
		PushesInvoices: true, EventFeed: true,
		ChargeAutomatically: true, PaymentMethodCapture: true, BillingPortal: true,
		Currencies: nil, RefusedCurrencies: RefusedCurrencies,
	}
}

// client is a Stripe client for one account. The library never retries:
// billing owns retries, and a library retry would hide a fault from it.
func (a *Adapter) client(settings *Settings) *stripego.Client {
	config := &stripego.BackendConfig{
		MaxNetworkRetries: stripego.Int64(0),
		LeveledLogger:     &stripego.LeveledLogger{Level: stripego.LevelNull},
		HTTPClient:        a.opts.HTTPClient,
	}
	if a.opts.BaseURL != "" {
		config.URL = stripego.String(a.opts.BaseURL)
	}
	return stripego.NewClient(settings.SecretKey, stripego.WithBackends(stripego.NewBackendsWithConfig(config)))
}

func (a *Adapter) connect(ref provider.Ref) (*stripego.Client, *Settings, error) {
	settings, err := settingsOf(ref.Settings)
	if err != nil {
		return nil, nil, err
	}
	return a.client(settings), settings, nil
}

func dashboardURL(livemode bool, kind, id string) string {
	if livemode {
		return "https://dashboard.stripe.com/" + kind + "/" + id
	}
	return "https://dashboard.stripe.com/test/" + kind + "/" + id
}

// EnsureCustomer implements provider.Adapter: it creates the Stripe customer,
// or brings the e-mail of the one already mapped up to date.
func (a *Adapter) EnsureCustomer(ctx context.Context, ref provider.Ref, customer provider.Customer) (provider.CustomerRecord, error) {
	sc, settings, err := a.connect(ref)
	if err != nil {
		return provider.CustomerRecord{}, err
	}
	keyRoot := ref.OrganizationID.String() + ":customer:" + customer.CustomerID.String()

	// An earlier attempt may have created the customer and lost the answer
	// beyond Stripe's 24-hour key horizon, when its key no longer replays:
	// the customer is found by the Kaiten ids it carries and adopted, never
	// created twice (S09-G07).
	if customer.ExternalID == "" {
		customer.ExternalID = a.findCustomer(ctx, sc, ref.OrganizationID, customer.CustomerID)
	}

	if customer.ExternalID == "" {
		metadata := map[string]string{}
		for k, v := range customer.Metadata {
			metadata[k] = v
		}
		// What findCustomer searches on, whatever the caller sent.
		metadata["kaiten_customer_id"] = customer.CustomerID.String()
		metadata["kaiten_organization_id"] = ref.OrganizationID.String()
		params := &stripego.CustomerCreateParams{Name: stripego.String(customer.Name), Metadata: metadata}
		if customer.Email != "" {
			params.Email = stripego.String(customer.Email)
		}
		key := keyRoot
		if customer.RecreateOf != "" {
			key += ":recreate:" + customer.RecreateOf
		}
		params.SetIdempotencyKey(key)
		created, err := sc.V1Customers.Create(ctx, params)
		if err != nil {
			return provider.CustomerRecord{}, classify(err, objectNone)
		}
		return provider.CustomerRecord{ExternalID: created.ID, WebURL: dashboardURL(settings.Livemode(), "customers", created.ID)}, nil
	}

	existing, err := sc.V1Customers.Retrieve(ctx, customer.ExternalID, nil)
	if err != nil {
		return provider.CustomerRecord{}, classify(err, objectCustomer)
	}
	if existing.Deleted {
		return provider.CustomerRecord{}, &provider.Error{
			Class: provider.ClassCustomerMissing, Code: "customer_deleted", Param: "", RequestID: "",
			Message: "the Stripe customer was deleted",
		}
	}
	if customer.Email != "" && customer.Email != existing.Email {
		digest := sha256.Sum256([]byte(customer.Email))
		params := &stripego.CustomerUpdateParams{Email: stripego.String(customer.Email)}
		params.SetIdempotencyKey(keyRoot + ":email:" + hex.EncodeToString(digest[:])[:16])
		if _, err := sc.V1Customers.Update(ctx, customer.ExternalID, params); err != nil {
			return provider.CustomerRecord{}, classify(err, objectCustomer)
		}
	}
	return provider.CustomerRecord{ExternalID: existing.ID, WebURL: dashboardURL(settings.Livemode(), "customers", existing.ID)}, nil
}

// findCustomer is the live Stripe customer created for a Kaiten customer of
// the organization, found by the metadata it was created with; "" when there
// is none, or when search cannot answer (Stripe does not offer it in every
// region): then the caller creates the customer, as it would have.
func (a *Adapter) findCustomer(ctx context.Context, sc *stripego.Client, organizationID, customerID uuid.UUID) string {
	params := &stripego.CustomerSearchParams{SearchParams: stripego.SearchParams{
		Query: "metadata['kaiten_customer_id']:'" + customerID.String() + "' AND metadata['kaiten_organization_id']:'" + organizationID.String() + "'",
		Limit: stripego.Int64(10),
	}}
	for found, err := range sc.V1Customers.Search(ctx, params).All(ctx) {
		if err != nil {
			slog.DebugContext(ctx, "stripe: customer search unavailable; creating the customer", "error", classify(err, objectNone))
			return ""
		}
		if !found.Deleted {
			return found.ID
		}
	}
	return ""
}

// FindInvoice implements provider.Adapter: the customer's draft or open
// invoice created for the Kaiten invoice, when an earlier attempt's answer was
// lost.
func (a *Adapter) FindInvoice(ctx context.Context, ref provider.Ref, externalCustomerID string, kaitenInvoiceID uuid.UUID) (*provider.Invoice, error) {
	sc, _, err := a.connect(ref)
	if err != nil {
		return nil, err
	}
	for _, status := range []string{"draft", "open"} {
		params := &stripego.InvoiceListParams{Customer: stripego.String(externalCustomerID), Status: stripego.String(status)}
		params.Limit = stripego.Int64(100)
		for inv, err := range sc.V1Invoices.List(ctx, params).All(ctx) {
			if err != nil {
				return nil, classify(err, objectCustomer)
			}
			if inv.Metadata["kaiten_invoice_id"] == kaitenInvoiceID.String() {
				found, err := a.read(ctx, sc, inv)
				if err != nil {
					return nil, err
				}
				return &found, nil
			}
		}
	}
	return nil, nil
}

// CreateDraft implements provider.Adapter. The draft is created empty, out of
// automatic collection (auto_advance false) and without pending items, and
// its metadata carries the tax behaviour its items are added with, so that a
// settings change between two attempts never mixes behaviours on one invoice.
func (a *Adapter) CreateDraft(ctx context.Context, ref provider.Ref, in provider.NormalizedInvoice) (provider.Invoice, error) {
	sc, settings, err := a.connect(ref)
	if err != nil {
		return provider.Invoice{}, err
	}
	collection := "send_invoice"
	if in.CollectionMethod == "CHARGE_AUTOMATICALLY" {
		collection = "charge_automatically"
	}
	metadata := map[string]string{}
	for k, v := range in.Metadata {
		metadata[k] = v
	}
	// What FindInvoice and reconciliation key on, whatever the caller sent.
	metadata["kaiten_invoice_id"] = in.KaitenInvoiceID.String()
	metadata["kaiten_tax_behavior"] = string(settings.TaxBehavior)
	params := &stripego.InvoiceCreateParams{
		Customer:                    stripego.String(in.ExternalCustomerID),
		Currency:                    stripego.String(strings.ToLower(in.Currency)),
		CollectionMethod:            stripego.String(collection),
		AutoAdvance:                 stripego.Bool(false),
		PendingInvoiceItemsBehavior: stripego.String("exclude"),
		AutomaticTax:                &stripego.InvoiceCreateAutomaticTaxParams{Enabled: stripego.Bool(settings.AutomaticTax)},
		Metadata:                    metadata,
	}
	// Stripe refuses days_until_due on an invoice it charges itself.
	if in.DaysUntilDue != nil && collection == "send_invoice" {
		params.DaysUntilDue = stripego.Int64(int64(*in.DaysUntilDue))
	}
	params.SetIdempotencyKey(in.KaitenInvoiceID.String() + ":draft")
	created, err := sc.V1Invoices.Create(ctx, params)
	if err != nil {
		return provider.Invoice{}, classify(err, objectCustomer)
	}
	return a.read(ctx, sc, created)
}

// AddLine implements provider.Adapter: one invoice item, attached to the
// draft by id, carrying the line's integer amount, its service period in
// seconds and the coupons of the discounts it bears, in DISCOUNT seq order.
// No item is ever negative: Stripe refuses one under automatic tax, and a
// discount reaches Stripe as a coupon (CR-001).
func (a *Adapter) AddLine(ctx context.Context, ref provider.Ref, externalInvoiceID string, in provider.NormalizedInvoice, line provider.NormalizedLine) (string, error) {
	if line.AmountMinor < 0 {
		return "", fmt.Errorf("stripe: refusing a negative invoice item for line %d", line.Seq)
	}
	sc, settings, err := a.connect(ref)
	if err != nil {
		return "", err
	}
	draft, err := sc.V1Invoices.Retrieve(ctx, externalInvoiceID, nil)
	if err != nil {
		return "", classify(err, objectInvoice)
	}
	behavior := TaxBehavior(draft.Metadata["kaiten_tax_behavior"])
	if behavior != TaxExclusive && behavior != TaxInclusive {
		behavior = settings.TaxBehavior
	}
	params := &stripego.InvoiceItemCreateParams{
		Customer:    stripego.String(in.ExternalCustomerID),
		Invoice:     stripego.String(externalInvoiceID),
		Amount:      stripego.Int64(line.AmountMinor),
		Currency:    stripego.String(strings.ToLower(in.Currency)),
		Description: stripego.String(line.Description),
		Period: &stripego.InvoiceItemCreatePeriodParams{
			Start: stripego.Int64(line.ServiceFrom.Unix()), End: stripego.Int64(line.ServiceTo.Unix()),
		},
		TaxBehavior: stripego.String(strings.ToLower(string(behavior))),
		Metadata: map[string]string{
			"kaiten_invoice_id": in.KaitenInvoiceID.String(), "kaiten_line_id": line.LineID.String(),
			"kaiten_line_seq": strconv.Itoa(line.Seq),
		},
	}
	for _, d := range line.Discounts {
		params.Discounts = append(params.Discounts, &stripego.InvoiceItemCreateDiscountParams{Coupon: stripego.String(d.ExternalID)})
	}
	key := in.KaitenInvoiceID.String() + ":line:" + strconv.Itoa(line.Seq)
	if line.Recreation > 0 {
		key += ":r" + strconv.Itoa(line.Recreation)
	}
	params.SetIdempotencyKey(key)
	created, err := sc.V1InvoiceItems.Create(ctx, params)
	if err != nil {
		return "", classify(err, objectInvoice)
	}
	return created.ID, nil
}

// Finalize implements provider.Adapter. It reads the invoice first: a
// finalization that already happened (an answer lost, a human in the
// dashboard) is applied as done, never attempted again.
func (a *Adapter) Finalize(ctx context.Context, ref provider.Ref, externalInvoiceID string, in provider.NormalizedInvoice) (provider.Invoice, error) {
	sc, _, err := a.connect(ref)
	if err != nil {
		return provider.Invoice{}, err
	}
	current, err := sc.V1Invoices.Retrieve(ctx, externalInvoiceID, nil)
	if err != nil {
		return provider.Invoice{}, classify(err, objectInvoice)
	}
	if current.Status != stripego.InvoiceStatusDraft {
		return a.read(ctx, sc, current)
	}
	if current.CollectionMethod == stripego.InvoiceCollectionMethodSendInvoice && in.DaysUntilDue != nil {
		// Stripe counts days_until_due from the draft's creation (measured:
		// TestStripeSpike), Kaiten from the finalization (§12.4 rule 4): a
		// draft that waited, or a push retried for hours, would fall due
		// early. Its due date is set from now, just before it is finalized;
		// the minute is slack for the finalization's own delay.
		due := a.opts.Now().Add(time.Duration(*in.DaysUntilDue)*24*time.Hour + time.Minute)
		update := &stripego.InvoiceUpdateParams{DueDate: stripego.Int64(due.Unix())}
		// Keyed on the date itself: a retry computes another one, and the
		// same key with another date would answer idempotency_error.
		update.SetIdempotencyKey(in.KaitenInvoiceID.String() + ":due_date:" + strconv.FormatInt(due.Unix(), 10))
		if _, err := sc.V1Invoices.Update(ctx, externalInvoiceID, update); err != nil {
			return provider.Invoice{}, classify(err, objectInvoice)
		}
	}
	params := &stripego.InvoiceFinalizeInvoiceParams{AutoAdvance: stripego.Bool(true)}
	params.SetIdempotencyKey(in.KaitenInvoiceID.String() + ":finalize")
	finalized, err := sc.V1Invoices.FinalizeInvoice(ctx, externalInvoiceID, params)
	if err != nil {
		return provider.Invoice{}, classify(err, objectInvoice)
	}
	if a.opts.SendAfterFinalize && finalized.CollectionMethod == stripego.InvoiceCollectionMethodSendInvoice {
		send := &stripego.InvoiceSendInvoiceParams{}
		send.SetIdempotencyKey(in.KaitenInvoiceID.String() + ":send")
		if _, err := sc.V1Invoices.SendInvoice(ctx, externalInvoiceID, send); err != nil {
			return provider.Invoice{}, classify(err, objectInvoice)
		}
	}
	return a.read(ctx, sc, finalized)
}

// GetInvoice implements provider.Adapter: the invoice with every line.
func (a *Adapter) GetInvoice(ctx context.Context, ref provider.Ref, externalInvoiceID string) (provider.Invoice, error) {
	sc, _, err := a.connect(ref)
	if err != nil {
		return provider.Invoice{}, err
	}
	inv, err := sc.V1Invoices.Retrieve(ctx, externalInvoiceID, nil)
	if err != nil {
		return provider.Invoice{}, classify(err, objectInvoice)
	}
	if inv.Deleted {
		return provider.Invoice{}, &provider.Error{Class: provider.ClassNotFound, Code: "resource_missing", Param: "", RequestID: "", Message: "the draft was deleted"}
	}
	return a.read(ctx, sc, inv)
}

// VoidInvoice implements provider.Adapter: an open invoice is voided, a draft
// deleted (Stripe cannot void a draft); one already void or deleted is a
// success.
func (a *Adapter) VoidInvoice(ctx context.Context, ref provider.Ref, externalInvoiceID string) error {
	sc, _, err := a.connect(ref)
	if err != nil {
		return err
	}
	inv, err := sc.V1Invoices.Retrieve(ctx, externalInvoiceID, nil)
	if isMissing(err) {
		return nil
	}
	if err != nil {
		return classify(err, objectInvoice)
	}
	switch inv.Status {
	case stripego.InvoiceStatusDraft:
		if _, err := sc.V1Invoices.Delete(ctx, externalInvoiceID, nil); err != nil && !isMissing(err) {
			return classify(err, objectInvoice)
		}
		return nil
	case stripego.InvoiceStatusOpen:
		params := &stripego.InvoiceVoidInvoiceParams{}
		root := inv.Metadata["kaiten_invoice_id"]
		if root == "" {
			root = externalInvoiceID
		}
		params.SetIdempotencyKey(root + ":void")
		if _, err := sc.V1Invoices.VoidInvoice(ctx, externalInvoiceID, params); err != nil {
			return classify(err, objectInvoice)
		}
		return nil
	case stripego.InvoiceStatusVoid:
		return nil
	default:
		return &provider.Error{
			Class: provider.ClassRejected, Code: "invoice_" + string(inv.Status), Param: "", RequestID: "",
			Message: "the Stripe invoice is " + string(inv.Status) + " and cannot be voided",
		}
	}
}

// ListInvoiceEvents implements provider.Adapter: Stripe's invoice events
// created since since, oldest first. The cursor is the newest event read; an
// event at or before it in this read is not returned again.
func (a *Adapter) ListInvoiceEvents(ctx context.Context, ref provider.Ref, cursor string, since time.Time) ([]provider.Event, string, error) {
	sc, _, err := a.connect(ref)
	if err != nil {
		return nil, "", err
	}
	if since.IsZero() {
		since = a.opts.Now().Add(-firstPassLookback)
	}
	params := &stripego.EventListParams{
		Types:        stripego.StringSlice(invoiceEvents),
		CreatedRange: &stripego.RangeQueryParams{GreaterThanOrEqual: since.Unix()},
	}
	params.Limit = stripego.Int64(100)
	var newestFirst []*stripego.Event
	for event, err := range sc.V1Events.List(ctx, params).All(ctx) {
		if err != nil {
			return nil, "", classify(err, objectNone)
		}
		newestFirst = append(newestFirst, event)
	}
	// Stripe lists newest first; the feed is applied oldest first.
	var out []provider.Event
	for i := len(newestFirst) - 1; i >= 0; i-- {
		event := newestFirst[i]
		if event.ID == cursor {
			out = out[:0] // everything up to the cursor was read before
			continue
		}
		out = append(out, eventOf(event))
	}
	next := cursor
	if len(out) > 0 {
		next = out[len(out)-1].ID
	}
	return out, next, nil
}

// CheckCredentials implements provider.CredentialChecker: one read-only call
// with the key about to be stored.
func (a *Adapter) CheckCredentials(ctx context.Context, settings any) (provider.Account, error) {
	s, err := settingsOf(settings)
	if err != nil {
		return provider.Account{}, err
	}
	params := &stripego.CustomerListParams{}
	params.Limit = stripego.Int64(1)
	params.Single = true
	for _, err := range a.client(s).V1Customers.List(ctx, params).All(ctx) {
		if err != nil {
			return provider.Account{}, classify(err, objectNone)
		}
		break
	}
	return provider.Account{Livemode: s.Livemode()}, nil
}

// SameAccount implements provider.AccountVerifier: a customer Kaiten mapped
// is visible, deleted or not, to a key of the same account only.
func (a *Adapter) SameAccount(ctx context.Context, settings any, externalCustomerID string) (bool, error) {
	s, err := settingsOf(settings)
	if err != nil {
		return false, err
	}
	_, err = a.client(s).V1Customers.Retrieve(ctx, externalCustomerID, nil)
	if isMissing(err) {
		return false, nil
	}
	if err != nil {
		return false, classify(err, objectNone)
	}
	return true, nil
}

// read maps a Stripe invoice, with every line, to the provider's shape.
func (a *Adapter) read(ctx context.Context, sc *stripego.Client, inv *stripego.Invoice) (provider.Invoice, error) {
	out := provider.Invoice{
		ExternalID: inv.ID, Status: provider.Status(inv.Status), Number: inv.Number,
		HostedURL: inv.HostedInvoiceURL, PDFURL: inv.InvoicePDF, AttemptCount: int(inv.AttemptCount),
		TotalExcludingTax: inv.TotalExcludingTax, Subtotal: inv.Subtotal, Currency: strings.ToUpper(string(inv.Currency)),
	}
	for _, d := range inv.TotalDiscountAmounts {
		if d != nil {
			out.TotalDiscount += d.Amount
		}
	}
	if inv.Customer != nil {
		out.ExternalCustomerID = inv.Customer.ID
	}
	if id, err := uuid.Parse(inv.Metadata["kaiten_invoice_id"]); err == nil {
		out.KaitenInvoiceID = id
	}
	if t := inv.StatusTransitions; t != nil {
		out.FinalizedAt, out.PaidAt = instant(t.FinalizedAt), instant(t.PaidAt)
		out.UncollectibleAt, out.VoidedAt = instant(t.MarkedUncollectibleAt), instant(t.VoidedAt)
	}
	if inv.DueDate > 0 {
		due := time.Unix(inv.DueDate, 0).UTC()
		out.DueAt = &due
	}
	if inv.LastFinalizationError != nil {
		out.LastPaymentError = string(inv.LastFinalizationError.Code)
	}
	lines, err := a.lines(ctx, sc, inv)
	if err != nil {
		return provider.Invoice{}, err
	}
	out.Lines = lines
	return out, nil
}

// lines reads an invoice's lines. The lines embedded in the invoice serve
// when they are all there and nothing is discounted; otherwise they are
// listed, with their discounts expanded so that each discount amount names
// its coupon.
func (a *Adapter) lines(ctx context.Context, sc *stripego.Client, inv *stripego.Invoice) ([]provider.Line, error) {
	var raw []*stripego.InvoiceLineItem
	if inv.Lines != nil && !inv.Lines.HasMore && len(inv.TotalDiscountAmounts) == 0 {
		raw = inv.Lines.Data
	} else {
		params := &stripego.InvoiceListLinesParams{Invoice: stripego.String(inv.ID)}
		params.Limit = stripego.Int64(100)
		params.AddExpand("data.discounts")
		for line, err := range sc.V1Invoices.ListLines(ctx, params).All(ctx) {
			if err != nil {
				return nil, classify(err, objectInvoice)
			}
			raw = append(raw, line)
		}
	}
	out := make([]provider.Line, 0, len(raw))
	for _, line := range raw {
		external := line.ID
		if line.Parent != nil && line.Parent.InvoiceItemDetails != nil && line.Parent.InvoiceItemDetails.InvoiceItem != "" {
			external = line.Parent.InvoiceItemDetails.InvoiceItem
		}
		kaitenLine := uuid.Nil
		if id, err := uuid.Parse(line.Metadata["kaiten_line_id"]); err == nil {
			kaitenLine = id
		}
		out = append(out, provider.Line{
			ExternalLineID: external, KaitenLineID: kaitenLine, AmountMinor: line.Amount,
			Currency: strings.ToUpper(string(line.Currency)), Discounts: lineDiscounts(line),
		})
	}
	return out, nil
}

func instant(epoch int64) *time.Time {
	if epoch == 0 {
		return nil
	}
	t := time.Unix(epoch, 0).UTC()
	return &t
}

// String keeps the adapter's printed form free of anything configured.
func (a *Adapter) String() string { return fmt.Sprintf("stripe.Adapter{baseURL: %q}", a.opts.BaseURL) }

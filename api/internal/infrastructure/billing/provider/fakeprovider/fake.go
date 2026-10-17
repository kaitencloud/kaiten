// Package fakeprovider is an in-memory payment provider for tests: it pushes,
// finalizes and reports invoices like a real provider, honours idempotency
// keys, and lets a test inject faults and act on the provider's side (a
// payment, a void, a draft deleted, a line edited).
//
// It is never registered by a production deployment.
package fakeprovider

import (
	"context"
	"fmt"
	"slices"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
)

// Operations, as FailNext, LoseNext and Calls name them.
const (
	OpEnsureCustomer = "EnsureCustomer"
	OpFindInvoice    = "FindInvoice"
	OpCreateDraft    = "CreateDraft"
	OpAddLine        = "AddLine"
	OpAddDiscount    = "AddDiscount"
	OpDeleteLine     = "DeleteLine"
	OpDeleteDiscount = "DeleteDiscount"
	OpFinalize       = "Finalize"
	OpGetInvoice     = "GetInvoice"
	OpVoidInvoice    = "VoidInvoice"
	OpListEvents     = "ListInvoiceEvents"
)

type invoice struct {
	provider.Invoice
	deleted bool
	// keys are the line idempotency keys seen: "<seq>:r<recreation>" ->
	// external line id.
	keys map[string]string
}

// discount is a provider discount: one allocation of a DISCOUNT line.
type discount struct {
	ID      string
	Invoice uuid.UUID
	Seq     int
	Target  int
	Amount  int64
	Deleted bool
}

// Fake is the in-memory provider. Its zero value is not usable: see New.
type Fake struct {
	kind provider.Kind
	caps provider.Capabilities

	mu        sync.Mutex
	clock     func() time.Time
	customers map[uuid.UUID]provider.CustomerRecord // by Kaiten customer
	emails    map[string]string                     // external customer -> e-mail
	invoices  map[string]*invoice                   // by external id
	drafts    map[uuid.UUID]string                  // idempotency key "<invoice>:draft" -> external id
	events    []provider.Event
	// discounts are by "<invoice>:<seq>:<target>", ids deterministic like
	// Stripe's coupon ids: they outlive the idempotency keys.
	discounts map[string]*discount
	// applied overrides the amount a discount takes off a line:
	// "<external line>/<discount>" -> amount.
	applied  map[string]int64
	failures map[string][]error
	losses   map[string]int
	calls    map[string]int
	seq      int
	// tag makes this fake's ids distinct from another fake's.
	tag string
}

// New returns a fake provider recorded under kind, pushing invoices and
// reporting changes through an event feed.
func New(kind provider.Kind) *Fake {
	return &Fake{
		kind: kind,
		caps: provider.Capabilities{
			PushesInvoices: true, EventFeed: true, ChargeAutomatically: false,
			PaymentMethodCapture: false, BillingPortal: false, Currencies: nil,
		},
		clock:     func() time.Time { return time.Now().UTC().Truncate(time.Millisecond) },
		customers: map[uuid.UUID]provider.CustomerRecord{},
		emails:    map[string]string{},
		invoices:  map[string]*invoice{},
		drafts:    map[uuid.UUID]string{},
		events:    nil,
		discounts: map[string]*discount{},
		applied:   map[string]int64{},
		failures:  map[string][]error{},
		losses:    map[string]int{},
		calls:     map[string]int{},
		seq:       0,
		tag:       uuid.NewString()[:8],
	}
}

var _ provider.Adapter = (*Fake)(nil)

// Currencies restricts the currencies the fake accepts.
func (f *Fake) Currencies(currencies ...string) { f.caps.Currencies = currencies }

// Kind implements provider.Adapter.
func (f *Fake) Kind() provider.Kind { return f.kind }

// Capabilities implements provider.Adapter.
func (f *Fake) Capabilities() provider.Capabilities { return f.caps }

// FailNext makes the next call of op fail with err, before it acts. Calls
// queue: FailNext twice fails the next two calls.
func (f *Fake) FailNext(op string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.failures[op] = append(f.failures[op], err)
}

// LoseNext makes the next call of op act, then answer a timeout: the caller
// cannot know whether it happened.
func (f *Fake) LoseNext(op string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.losses[op]++
}

// ForgetKeys drops the idempotency keys the fake remembers, as a provider
// prunes them after a day: a repeated create makes a second object.
func (f *Fake) ForgetKeys() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.drafts = map[uuid.UUID]string{}
	for _, inv := range f.invoices {
		inv.keys = map[string]string{}
	}
}

// Discounts lists the live discounts created for a Kaiten invoice, by seq
// then target.
func (f *Fake) Discounts(kaitenInvoiceID uuid.UUID) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var live []*discount
	for _, d := range f.discounts {
		if d.Invoice == kaitenInvoiceID && !d.Deleted {
			live = append(live, d)
		}
	}
	sort.Slice(live, func(i, j int) bool {
		if live[i].Seq != live[j].Seq {
			return live[i].Seq < live[j].Seq
		}
		return live[i].Target < live[j].Target
	})
	out := make([]string, len(live))
	for i, d := range live {
		out[i] = d.ID
	}
	return out
}

// AddForeignDiscount applies a discount Kaiten did not create to a line of a
// draft, as a human applying a coupon in the dashboard would.
func (f *Fake) AddForeignDiscount(externalID string, kaitenLineID uuid.UUID, amount int64) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	inv := f.invoices[externalID]
	if inv == nil {
		return ""
	}
	d := &discount{ID: f.next("dc_"), Invoice: uuid.Nil, Seq: 0, Target: 0, Amount: amount, Deleted: false}
	f.discounts["foreign:"+d.ID] = d
	for i := range inv.Lines {
		if inv.Lines[i].KaitenLineID == kaitenLineID {
			inv.Lines[i].Discounts = append(inv.Lines[i].Discounts, provider.LineDiscount{Seq: 0, ExternalID: d.ID, AmountMinor: amount})
		}
	}
	f.recompute(inv)
	return d.ID
}

// SetDiscountAmount changes what one discount takes off a line, as a
// provider computing it differently would.
func (f *Fake) SetDiscountAmount(externalID string, kaitenLineID uuid.UUID, discountID string, amount int64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	inv := f.invoices[externalID]
	if inv == nil {
		return
	}
	for _, line := range inv.Lines {
		if line.KaitenLineID == kaitenLineID {
			f.applied[line.ExternalLineID+"/"+discountID] = amount
		}
	}
	f.recompute(inv)
}

// Calls counts the calls of op, failed ones included.
func (f *Fake) Calls(op string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls[op]
}

// Invoices lists the provider invoices created for a Kaiten invoice,
// deleted drafts included.
func (f *Fake) Invoices(kaitenInvoiceID uuid.UUID) []provider.Invoice {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []provider.Invoice
	for _, inv := range f.invoices {
		if inv.KaitenInvoiceID == kaitenInvoiceID {
			out = append(out, inv.Invoice)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ExternalID < out[j].ExternalID })
	return out
}

// Customers counts the provider customers.
func (f *Fake) Customers() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.customers)
}

// PayInProvider records a payment of an open invoice in the provider.
func (f *Fake) PayInProvider(externalID string) {
	f.transition(externalID, provider.StatusPaid, "invoice.paid")
}

// MarkUncollectible marks an open invoice uncollectible in the provider.
func (f *Fake) MarkUncollectible(externalID string) {
	f.transition(externalID, provider.StatusUncollectible, "invoice.marked_uncollectible")
}

// VoidInProvider voids an invoice in the provider, outside Kaiten.
func (f *Fake) VoidInProvider(externalID string) {
	f.transition(externalID, provider.StatusVoid, "invoice.voided")
}

// FinalizeInProvider finalizes a draft in the provider, as a human reviewing
// it would.
func (f *Fake) FinalizeInProvider(externalID string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if inv := f.invoices[externalID]; inv != nil && inv.Status == provider.StatusDraft {
		f.finalize(inv)
	}
}

// DeleteDraft deletes a draft in the provider.
func (f *Fake) DeleteDraft(externalID string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if inv := f.invoices[externalID]; inv != nil && inv.Status == provider.StatusDraft {
		inv.deleted = true
		f.emit("invoice.deleted", externalID)
	}
}

// EditLine changes the amount of a line in the provider, as a human editing a
// draft would.
func (f *Fake) EditLine(externalID string, kaitenLineID uuid.UUID, amount int64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	inv := f.invoices[externalID]
	if inv == nil {
		return
	}
	for i := range inv.Lines {
		if inv.Lines[i].KaitenLineID == kaitenLineID {
			inv.Lines[i].AmountMinor = amount
		}
	}
	f.recompute(inv)
}

func (f *Fake) transition(externalID string, to provider.Status, event string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	inv := f.invoices[externalID]
	if inv == nil || inv.deleted {
		return
	}
	now := f.clock()
	inv.Status = to
	switch to {
	case provider.StatusPaid:
		inv.PaidAt = &now
	case provider.StatusUncollectible:
		inv.UncollectibleAt = &now
	case provider.StatusVoid:
		inv.VoidedAt = &now
	}
	f.emit(event, externalID)
}

// enter counts a call and answers an injected failure, if any.
func (f *Fake) enter(op string) error {
	f.calls[op]++
	if queued := f.failures[op]; len(queued) > 0 {
		f.failures[op] = queued[1:]
		return queued[0]
	}
	return nil
}

// lost reports whether the call that just acted must answer a timeout.
func (f *Fake) lost(op string) bool {
	if f.losses[op] > 0 {
		f.losses[op]--
		return true
	}
	return false
}

var errTimeout = &provider.Error{Class: provider.ClassUnavailable, Code: "timeout", Param: "", RequestID: "", Message: "the provider did not answer in time"}

func (f *Fake) next(prefix string) string {
	f.seq++
	return prefix + f.tag + "_" + strconv.Itoa(f.seq)
}

func (f *Fake) emit(eventType, externalInvoiceID string) {
	f.events = append(f.events, provider.Event{
		ID: f.next("evt_"), Type: eventType, CreatedAt: f.clock(), ExternalInvoiceID: externalInvoiceID,
	})
}

func (f *Fake) finalize(inv *invoice) {
	now := f.clock()
	inv.Status = provider.StatusOpen
	inv.FinalizedAt = &now
	inv.Number = fmt.Sprintf("FAKE-%04d", f.seq+1)
	inv.HostedURL = "https://provider.test/invoices/" + inv.ExternalID
	inv.PDFURL = "https://provider.test/invoices/" + inv.ExternalID + ".pdf"
	f.emit("invoice.finalized", inv.ExternalID)
}

// recompute applies each line's discounts in order, none taking the line
// below 0, and totals the invoice: subtotal before discounts, total
// excluding tax after them.
func (f *Fake) recompute(inv *invoice) {
	nominal := map[string]int64{}
	for _, d := range f.discounts {
		nominal[d.ID] = d.Amount
	}
	var subtotal, discounted int64
	for i := range inv.Lines {
		line := &inv.Lines[i]
		subtotal += line.AmountMinor
		left := line.AmountMinor
		for j := range line.Discounts {
			take := min(nominal[line.Discounts[j].ExternalID], left)
			if override, ok := f.applied[line.ExternalLineID+"/"+line.Discounts[j].ExternalID]; ok {
				take = override
			}
			line.Discounts[j].AmountMinor = take
			left -= take
			discounted += take
		}
	}
	// The subtotal is net of the line discounts, as Stripe's is.
	inv.Subtotal, inv.TotalDiscount, inv.TotalExcludingTax = subtotal-discounted, discounted, subtotal-discounted
}

func (inv *invoice) snapshot() provider.Invoice {
	out := inv.Invoice
	out.Lines = make([]provider.Line, len(inv.Lines))
	for i, line := range inv.Lines {
		out.Lines[i] = line
		out.Lines[i].Discounts = append([]provider.LineDiscount(nil), line.Discounts...)
	}
	return out
}

// EnsureCustomer implements provider.Adapter: one customer per Kaiten
// customer, its e-mail updated when it changed.
func (f *Fake) EnsureCustomer(_ context.Context, _ provider.Ref, customer provider.Customer) (provider.CustomerRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.enter(OpEnsureCustomer); err != nil {
		return provider.CustomerRecord{}, err
	}
	record, ok := f.customers[customer.CustomerID]
	if !ok {
		id := f.next("cus_")
		record = provider.CustomerRecord{ExternalID: id, WebURL: "https://provider.test/customers/" + id}
		f.customers[customer.CustomerID] = record
	}
	f.emails[record.ExternalID] = customer.Email
	if f.lost(OpEnsureCustomer) {
		return provider.CustomerRecord{}, errTimeout
	}
	return record, nil
}

// FindInvoice implements provider.Adapter: the live draft created for the
// Kaiten invoice, found by its metadata.
func (f *Fake) FindInvoice(_ context.Context, _ provider.Ref, _ string, kaitenInvoiceID uuid.UUID) (*provider.Invoice, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.enter(OpFindInvoice); err != nil {
		return nil, err
	}
	for _, inv := range f.invoices {
		if inv.KaitenInvoiceID == kaitenInvoiceID && !inv.deleted && inv.Status != provider.StatusVoid {
			found := inv.snapshot()
			return &found, nil
		}
	}
	return nil, nil
}

// CreateDraft implements provider.Adapter, idempotent on the Kaiten invoice
// id while the fake remembers its keys.
func (f *Fake) CreateDraft(_ context.Context, _ provider.Ref, in provider.NormalizedInvoice) (provider.Invoice, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.enter(OpCreateDraft); err != nil {
		return provider.Invoice{}, err
	}
	if id, ok := f.drafts[in.KaitenInvoiceID]; ok {
		return f.invoices[id].snapshot(), nil
	}
	id := f.next("in_")
	inv := &invoice{
		Invoice: provider.Invoice{
			ExternalID: id, ExternalCustomerID: in.ExternalCustomerID, KaitenInvoiceID: in.KaitenInvoiceID,
			Status: provider.StatusDraft, Currency: in.Currency,
		},
		deleted: false, keys: map[string]string{},
	}
	f.invoices[id] = inv
	f.drafts[in.KaitenInvoiceID] = id
	if f.lost(OpCreateDraft) {
		return provider.Invoice{}, errTimeout
	}
	return inv.snapshot(), nil
}

// AddLine implements provider.Adapter, idempotent on the line's seq while the
// fake remembers its keys.
func (f *Fake) AddLine(_ context.Context, _ provider.Ref, externalID string, in provider.NormalizedInvoice, line provider.NormalizedLine) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.enter(OpAddLine); err != nil {
		return "", err
	}
	inv := f.invoices[externalID]
	if inv == nil || inv.deleted {
		return "", &provider.Error{Class: provider.ClassNotFound, Code: "resource_missing", Message: "no such invoice"}
	}
	if inv.Status != provider.StatusDraft {
		return "", &provider.Error{Class: provider.ClassRejected, Code: "invoice_not_editable", Message: "the invoice is not a draft"}
	}
	if line.AmountMinor < 0 {
		return "", &provider.Error{Class: provider.ClassRejected, Code: "negative_line", Message: "a line is never negative"}
	}
	key := strconv.Itoa(line.Seq) + ":r" + strconv.Itoa(line.Recreation)
	if id, ok := inv.keys[key]; ok {
		return id, nil
	}
	var discounts []provider.LineDiscount
	for _, d := range line.Discounts {
		if !f.liveDiscount(d.ExternalID) {
			return "", &provider.Error{Class: provider.ClassRejected, Code: "resource_missing", Message: "no such discount " + d.ExternalID}
		}
		discounts = append(discounts, provider.LineDiscount{Seq: 0, ExternalID: d.ExternalID, AmountMinor: 0})
	}
	id := f.next("il_")
	inv.Lines = append(inv.Lines, provider.Line{
		ExternalLineID: id, KaitenLineID: line.LineID, AmountMinor: line.AmountMinor, Currency: in.Currency, Discounts: discounts,
	})
	inv.keys[key] = id
	f.recompute(inv)
	if f.lost(OpAddLine) {
		return "", errTimeout
	}
	return id, nil
}

func (f *Fake) liveDiscount(id string) bool {
	for _, d := range f.discounts {
		if d.ID == id {
			return !d.Deleted
		}
	}
	return false
}

// AddDiscount implements provider.Adapter: one discount per (invoice,
// DISCOUNT seq, target), adopted when it exists with the same amount.
func (f *Fake) AddDiscount(_ context.Context, _ provider.Ref, externalID string, in provider.NormalizedInvoice, d provider.NormalizedDiscount) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.enter(OpAddDiscount); err != nil {
		return "", err
	}
	inv := f.invoices[externalID]
	if inv == nil || inv.deleted {
		return "", &provider.Error{Class: provider.ClassNotFound, Code: "resource_missing", Message: "no such invoice"}
	}
	if d.AmountMinor <= 0 {
		return "", &provider.Error{Class: provider.ClassRejected, Code: "parameter_invalid", Message: "a discount is positive"}
	}
	key := in.KaitenInvoiceID.String() + ":" + strconv.Itoa(d.Seq) + ":" + strconv.Itoa(d.TargetSeq) + ":r" + strconv.Itoa(d.Recreation)
	if existing, ok := f.discounts[key]; ok && !existing.Deleted {
		if existing.Amount != d.AmountMinor {
			return "", &provider.Error{Class: provider.ClassRejected, Code: "coupon_conflict", Message: "the discount exists with another amount"}
		}
		return existing.ID, nil
	}
	created := &discount{ID: f.next("dc_"), Invoice: in.KaitenInvoiceID, Seq: d.Seq, Target: d.TargetSeq, Amount: d.AmountMinor, Deleted: false}
	f.discounts[key] = created
	if f.lost(OpAddDiscount) {
		return "", errTimeout
	}
	return created.ID, nil
}

// DeleteLine implements provider.Adapter: draft lines only.
func (f *Fake) DeleteLine(_ context.Context, _ provider.Ref, externalID, externalLineID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.enter(OpDeleteLine); err != nil {
		return err
	}
	inv := f.invoices[externalID]
	if inv == nil || inv.deleted {
		return &provider.Error{Class: provider.ClassNotFound, Code: "resource_missing", Message: "no such invoice"}
	}
	if inv.Status != provider.StatusDraft {
		return &provider.Error{Class: provider.ClassRejected, Code: "invoice_not_editable", Message: "the invoice is not a draft"}
	}
	inv.Lines = slices.DeleteFunc(inv.Lines, func(l provider.Line) bool { return l.ExternalLineID == externalLineID })
	f.recompute(inv)
	return nil
}

// DeleteDiscount implements provider.Adapter: the discounts already applied
// stay on their lines.
func (f *Fake) DeleteDiscount(_ context.Context, _ provider.Ref, externalDiscountID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.enter(OpDeleteDiscount); err != nil {
		return err
	}
	for _, d := range f.discounts {
		if d.ID == externalDiscountID {
			d.Deleted = true
		}
	}
	return nil
}

// Finalize implements provider.Adapter: an open invoice is returned as is.
func (f *Fake) Finalize(_ context.Context, _ provider.Ref, externalID string, _ provider.NormalizedInvoice) (provider.Invoice, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.enter(OpFinalize); err != nil {
		return provider.Invoice{}, err
	}
	inv := f.invoices[externalID]
	if inv == nil || inv.deleted {
		return provider.Invoice{}, &provider.Error{Class: provider.ClassNotFound, Code: "resource_missing", Message: "no such invoice"}
	}
	if inv.Status == provider.StatusDraft {
		f.finalize(inv)
	}
	if f.lost(OpFinalize) {
		return provider.Invoice{}, errTimeout
	}
	return inv.snapshot(), nil
}

// GetInvoice implements provider.Adapter.
func (f *Fake) GetInvoice(_ context.Context, _ provider.Ref, externalID string) (provider.Invoice, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.enter(OpGetInvoice); err != nil {
		return provider.Invoice{}, err
	}
	inv := f.invoices[externalID]
	if inv == nil || inv.deleted {
		return provider.Invoice{}, &provider.Error{Class: provider.ClassNotFound, Code: "resource_missing", Message: "no such invoice"}
	}
	return inv.snapshot(), nil
}

// VoidInvoice implements provider.Adapter: a draft is deleted, an open
// invoice voided; one already gone is a success, a paid one refused.
func (f *Fake) VoidInvoice(_ context.Context, _ provider.Ref, externalID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.enter(OpVoidInvoice); err != nil {
		return err
	}
	inv := f.invoices[externalID]
	if inv == nil || inv.deleted {
		return nil
	}
	switch inv.Status {
	case provider.StatusDraft:
		inv.deleted = true
		f.emit("invoice.deleted", externalID)
	case provider.StatusOpen, provider.StatusUncollectible:
		now := f.clock()
		inv.Status, inv.VoidedAt = provider.StatusVoid, &now
		f.emit("invoice.voided", externalID)
	case provider.StatusPaid:
		return &provider.Error{Class: provider.ClassRejected, Code: "invoice_paid", Message: "a paid invoice cannot be voided"}
	}
	if f.lost(OpVoidInvoice) {
		return errTimeout
	}
	return nil
}

// ListInvoiceEvents implements provider.Adapter: the events after cursor (an
// event id), or created since, oldest first.
func (f *Fake) ListInvoiceEvents(_ context.Context, _ provider.Ref, cursor string, since time.Time) ([]provider.Event, string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.enter(OpListEvents); err != nil {
		return nil, "", err
	}
	start := 0
	if cursor != "" {
		for i, event := range f.events {
			if event.ID == cursor {
				start = i + 1
			}
		}
	} else {
		for start < len(f.events) && f.events[start].CreatedAt.Before(since) {
			start++
		}
	}
	out := append([]provider.Event(nil), f.events[start:]...)
	next := cursor
	if len(out) > 0 {
		next = out[len(out)-1].ID
	}
	return out, next, nil
}

// CreateSetupSession implements provider.Adapter.
func (f *Fake) CreateSetupSession(context.Context, provider.Ref, provider.SetupSession) (provider.SetupSessionLink, error) {
	return provider.SetupSessionLink{}, provider.ErrUnsupported
}

// GetSetupSession implements provider.Adapter.
func (f *Fake) GetSetupSession(context.Context, provider.Ref, string) (provider.SetupSessionResult, error) {
	return provider.SetupSessionResult{}, provider.ErrUnsupported
}

// CreateBillingPortalSession implements provider.Adapter.
func (f *Fake) CreateBillingPortalSession(context.Context, provider.Ref, string, string) (string, error) {
	return "", provider.ErrUnsupported
}

// DetachPaymentMethod implements provider.Adapter.
func (f *Fake) DetachPaymentMethod(context.Context, provider.Ref, string) error {
	return provider.ErrUnsupported
}

// Pay implements provider.Adapter: not supported.
func (f *Fake) Pay(context.Context, provider.Ref, string, provider.NormalizedInvoice) (provider.PaymentOutcome, error) {
	return provider.PaymentOutcome{}, provider.ErrUnsupported
}

// DefaultPaymentMethod implements provider.Adapter: not supported.
func (f *Fake) DefaultPaymentMethod(context.Context, provider.Ref, string) (*provider.PaymentMethod, error) {
	return nil, provider.ErrUnsupported
}

// SetDefaultPaymentMethod implements provider.Adapter: not supported.
func (f *Fake) SetDefaultPaymentMethod(context.Context, provider.Ref, string, string) (provider.PaymentMethod, error) {
	return provider.PaymentMethod{}, provider.ErrUnsupported
}

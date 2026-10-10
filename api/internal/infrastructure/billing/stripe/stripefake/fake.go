// Package stripefake is an in-process Stripe for tests: an httptest server
// answering the endpoints the Stripe adapter calls, with Stripe's
// idempotency semantics, one state per account, a clock of its own and fault
// controls. It is how the adapter, the conformance suite and the integration
// tests run without a Stripe account.
//
// It implements what the adapter reads and no more, as Stripe documents it:
//   - Idempotency, per (account, Idempotency-Key), for 24 hours of the fake's
//     clock. The same parameters replay the stored status and body with
//     Idempotent-Replayed: true; other parameters answer 400
//     idempotency_error; a key still in flight answers 409. Results are
//     stored once the endpoint executed (2xx, 402, 5xx api_error, business
//     400s); parameter-validation 400s and 429s are not.
//   - Accounts: every key maps to an account (acct_default unless SetAccount
//     says otherwise), and objects belong to the account that created them.
//   - Ids are cus_<n>, in_<n>, ii_<n>, il_<n>, di_<n> and evt_<n>, in
//     creation order; a coupon has the id it was created with.
//   - Discounts: an item's coupons apply in order, none taking it below 0;
//     a line's discount_amounts and an invoice's total_discount_amounts name
//     their discount by id, and a line's discounts are ids unless expanded
//     (expand[]=data.discounts on its lines). A coupon is redeemed once per
//     item that ever bore it, deleted or not, unless its invoice is deleted.
//
// Never imported by production code (an architecture test enforces it).
package stripefake

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// Operations, as Fail, DropResponse, Delay and Count name them.
const (
	OpListCustomers    = "ListCustomers"
	OpCreateCustomer   = "CreateCustomer"
	OpRetrieveCustomer = "RetrieveCustomer"
	OpSearchCustomers  = "SearchCustomers"
	OpUpdateCustomer   = "UpdateCustomer"
	OpCreateInvoice    = "CreateInvoice"
	OpListInvoices     = "ListInvoices"
	OpRetrieveInvoice  = "RetrieveInvoice"
	OpListLines        = "ListLines"
	OpUpdateInvoice    = "UpdateInvoice"
	OpDeleteInvoice    = "DeleteInvoice"
	OpFinalizeInvoice  = "FinalizeInvoice"
	OpVoidInvoice      = "VoidInvoice"
	OpSendInvoice      = "SendInvoice"
	OpCreateItem       = "CreateInvoiceItem"
	OpDeleteItem       = "DeleteInvoiceItem"
	OpCreateCoupon     = "CreateCoupon"
	OpRetrieveCoupon   = "RetrieveCoupon"
	OpDeleteCoupon     = "DeleteCoupon"
	OpListEvents       = "ListEvents"
)

// DefaultAccount is the account of a key no SetAccount names.
const DefaultAccount = "acct_default"

// keyHorizon is how long Stripe remembers an idempotency key.
const keyHorizon = 24 * time.Hour

// Call is one request the fake received.
type Call struct {
	Op             string
	Method         string
	Path           string
	Form           url.Values
	IdempotencyKey string
	StripeVersion  string
	Authorization  string
}

// Fake is a running fake Stripe.
type Fake struct {
	server *httptest.Server

	mu       sync.Mutex
	now      time.Time
	clockSet bool
	seq      map[string]int
	accounts map[string]string // key -> account
	rejected map[string]apiError
	state    map[string]*account
	keys     map[string]*storedKey // account + "\x00" + key
	calls    []Call
	faults   map[string][]fault
	delays   map[string]time.Duration
	drops    map[string]int
	down     bool
}

type account struct {
	customers map[string]*customer
	invoices  map[string]*invoice
	order     []string // invoice ids, creation order
	items     map[string]*item
	coupons   map[string]*coupon
	// redeemed is, per coupon, the invoice of every item that ever bore it:
	// deleting the item does not give the redemption back, as Stripe test
	// mode showed (TestStripeSpike); deleting its invoice does.
	redeemed map[string][]string
	events   []*event
	payments *payments
}

type customer struct {
	ID       string            `json:"id"`
	Object   string            `json:"object"`
	Email    string            `json:"email"`
	Name     string            `json:"name"`
	Metadata map[string]string `json:"metadata"`
	Livemode bool              `json:"livemode"`
	Deleted  bool              `json:"deleted,omitempty"`
	Created  int64             `json:"created"`
}

type invoice struct {
	ID                          string            `json:"id"`
	Object                      string            `json:"object"`
	Customer                    string            `json:"customer"`
	Currency                    string            `json:"currency"`
	CollectionMethod            string            `json:"collection_method"`
	DaysUntilDue                int64             `json:"days_until_due,omitempty"`
	DueDate                     int64             `json:"due_date,omitempty"`
	AutoAdvance                 bool              `json:"auto_advance"`
	AutomaticTax                map[string]any    `json:"automatic_tax"`
	PendingInvoiceItemsBehavior string            `json:"-"`
	Metadata                    map[string]string `json:"metadata"`
	Status                      string            `json:"status"`
	Number                      string            `json:"number,omitempty"`
	HostedInvoiceURL            string            `json:"hosted_invoice_url,omitempty"`
	InvoicePDF                  string            `json:"invoice_pdf,omitempty"`
	StatusTransitions           map[string]int64  `json:"status_transitions"`
	AttemptCount                int64             `json:"attempt_count"`
	Subtotal                    int64             `json:"subtotal"`
	TotalExcludingTax           int64             `json:"total_excluding_tax"`
	Total                       int64             `json:"total"`
	Created                     int64             `json:"created"`
	Livemode                    bool              `json:"livemode"`
	Sent                        int               `json:"-"`
	deleted                     bool
	itemIDs                     []string
}

type item struct {
	ID          string            `json:"id"`
	Object      string            `json:"object"`
	Customer    string            `json:"customer"`
	Invoice     string            `json:"invoice"`
	Amount      int64             `json:"amount"`
	Currency    string            `json:"currency"`
	Description string            `json:"description"`
	TaxBehavior string            `json:"tax_behavior"`
	Metadata    map[string]string `json:"metadata"`
	Period      map[string]int64  `json:"period"`
	Discounts   []string          `json:"discounts"`
	lineID      string
	// discounts are the item's discounts: id and coupon, in order.
	discounts []itemDiscount
	// applied overrides what a discount takes off the item.
	applied map[string]int64
}

type itemDiscount struct {
	ID     string
	Coupon string
}

type coupon struct {
	ID             string            `json:"id"`
	Object         string            `json:"object"`
	AmountOff      int64             `json:"amount_off"`
	Currency       string            `json:"currency"`
	Duration       string            `json:"duration"`
	MaxRedemptions int64             `json:"max_redemptions"`
	Name           string            `json:"name"`
	Metadata       map[string]string `json:"metadata"`
	Valid          bool              `json:"valid"`
	Created        int64             `json:"created"`
	deleted        bool
}

type event struct {
	ID      string         `json:"id"`
	Object  string         `json:"object"`
	Type    string         `json:"type"`
	Created int64          `json:"created"`
	Data    map[string]any `json:"data"`
}

type storedKey struct {
	params   string
	status   int
	body     []byte
	at       time.Time
	inFlight bool
}

type fault struct {
	status int
	err    apiError
}

type apiError struct {
	Type        string `json:"type"`
	Code        string `json:"code,omitempty"`
	DeclineCode string `json:"decline_code,omitempty"`
	Message     string `json:"message"`
	Param       string `json:"param,omitempty"`
}

// New starts a fake Stripe, closed when the test ends.
func New(t testing.TB) *Fake {
	f := Start()
	t.Cleanup(f.Close)
	return f
}

// Start starts a fake Stripe the caller closes: one a TestMain shares across
// a package's tests, resetting it between them.
func Start() *Fake {
	f := &Fake{}
	f.Reset()
	f.server = httptest.NewServer(http.HandlerFunc(f.serve))
	return f
}

// Close stops the server.
func (f *Fake) Close() { f.server.Close() }

// Reset forgets every account, key, call, fault and clock setting.
func (f *Fake) Reset() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.seq, f.accounts, f.rejected = map[string]int{}, map[string]string{}, map[string]apiError{}
	f.state, f.keys, f.calls = map[string]*account{}, map[string]*storedKey{}, nil
	f.faults, f.delays, f.drops = map[string][]fault{}, map[string]time.Duration{}, map[string]int{}
	f.down, f.clockSet = false, false
}

// URL is the base URL the adapter is pointed at.
func (f *Fake) URL() string { return f.server.URL }

// Client is an HTTP client for the fake.
func (f *Fake) Client() *http.Client { return f.server.Client() }

// Now is the fake's clock: real time unless SetClock or Advance moved it.
func (f *Fake) Now() time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.clock()
}

func (f *Fake) clock() time.Time {
	if f.clockSet {
		return f.now
	}
	return time.Now().UTC()
}

// SetClock freezes the fake's clock at t.
func (f *Fake) SetClock(t time.Time) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.now, f.clockSet = t.UTC(), true
}

// Advance moves the fake's clock forward, freezing it first if needed.
func (f *Fake) Advance(d time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !f.clockSet {
		f.now, f.clockSet = time.Now().UTC(), true
	}
	f.now = f.now.Add(d)
}

// SetAccount maps a key to an account: objects created with one account's
// keys are invisible to another's (404 resource_missing).
func (f *Fake) SetAccount(key, accountID string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.accounts[key] = accountID
}

// RejectKey makes every request with key answer status with the error.
func (f *Fake) RejectKey(key string, status int, errType, code, message string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rejected[key] = apiError{Type: errType, Code: code, Message: message, DeclineCode: strconv.Itoa(status)}
}

// Fail makes the next times calls of op answer status with the error.
func (f *Fake) Fail(op string, status int, errType, code string, times int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for range times {
		f.faults[op] = append(f.faults[op], fault{status: status, err: apiError{Type: errType, Code: code, Message: "injected " + code}})
	}
}

// DropResponse applies the next call of op, then closes the connection
// before answering: the caller cannot know whether it happened.
func (f *Fake) DropResponse(op string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.drops[op]++
}

// Delay makes every call of op wait d before it is handled.
func (f *Fake) Delay(op string, d time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.delays[op] = d
}

// Partition refuses every connection while on.
func (f *Fake) Partition(on bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.down = on
}

// Calls lists the requests received, in order.
func (f *Fake) Calls() []Call {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]Call(nil), f.calls...)
}

// CallsOf lists the requests of one operation.
func (f *Fake) CallsOf(op string) []Call {
	var out []Call
	for _, c := range f.Calls() {
		if c.Op == op {
			out = append(out, c)
		}
	}
	return out
}

// Count is the number of requests of one operation.
func (f *Fake) Count(op string) int { return len(f.CallsOf(op)) }

// ResetCalls forgets the recorded requests.
func (f *Fake) ResetCalls() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = nil
}

// ForgetKeys expires every idempotency key, as 24 hours would.
func (f *Fake) ForgetKeys() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.keys = map[string]*storedKey{}
}

// Invoices lists the invoices of an account carrying the Kaiten invoice id in
// their metadata, deleted drafts excluded.
func (f *Fake) Invoices(accountID, kaitenInvoiceID string) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []string
	for _, id := range f.acct(accountID).order {
		inv := f.acct(accountID).invoices[id]
		if !inv.deleted && inv.Metadata["kaiten_invoice_id"] == kaitenInvoiceID {
			out = append(out, id)
		}
	}
	return out
}

// Invoice returns an invoice's state as JSON-able fields.
func (f *Fake) Invoice(accountID, id string) (status string, items int, ok bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	inv, found := f.acct(accountID).invoices[id]
	if !found || inv.deleted {
		return "", 0, false
	}
	return inv.Status, len(inv.itemIDs), true
}

// Customers is the number of customers of an account, deleted ones included.
func (f *Fake) Customers(accountID string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.acct(accountID).customers)
}

// Pay settles an open invoice in Stripe.
func (f *Fake) Pay(accountID, id string) {
	f.transition(accountID, id, "paid", "paid_at", "invoice.paid")
}

// MarkUncollectible writes an open invoice off in Stripe.
func (f *Fake) MarkUncollectible(accountID, id string) {
	f.transition(accountID, id, "uncollectible", "marked_uncollectible_at", "invoice.marked_uncollectible")
}

// VoidInStripe voids an open invoice from the dashboard.
func (f *Fake) VoidInStripe(accountID, id string) {
	f.transition(accountID, id, "void", "voided_at", "invoice.voided")
}

// FinalizeInStripe finalizes a draft from the dashboard.
func (f *Fake) FinalizeInStripe(accountID, id string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	a := f.acct(accountID)
	if inv, ok := a.invoices[id]; ok && inv.Status == "draft" {
		f.finalize(a, inv)
	}
}

// DeleteObject deletes a customer, or a draft invoice, in Stripe.
func (f *Fake) DeleteObject(accountID, id string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	a := f.acct(accountID)
	if c, ok := a.customers[id]; ok {
		c.Deleted = true
	}
	if inv, ok := a.invoices[id]; ok && inv.Status == "draft" {
		inv.deleted = true
		f.emit(a, "invoice.deleted", inv)
	}
}

// EditItemAmount changes an invoice item's amount in Stripe (a human editing
// a draft under review).
func (f *Fake) EditItemAmount(accountID, itemID string, amount int64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	a := f.acct(accountID)
	if it, ok := a.items[itemID]; ok {
		it.Amount = amount
		if inv, ok := a.invoices[it.Invoice]; ok {
			f.retotal(a, inv)
		}
	}
}

// AddForeignItem adds an item Kaiten did not create to an invoice.
func (f *Fake) AddForeignItem(accountID, invoiceID string, amount int64) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	a := f.acct(accountID)
	inv, ok := a.invoices[invoiceID]
	if !ok {
		return ""
	}
	it := &item{
		ID: f.next("ii"), Object: "invoiceitem", Customer: inv.Customer, Invoice: inv.ID, Amount: amount,
		Currency: inv.Currency, Description: "added in Stripe", TaxBehavior: "exclusive", Metadata: map[string]string{},
		Period: map[string]int64{"start": inv.Created, "end": inv.Created}, lineID: f.next("il"),
	}
	a.items[it.ID] = it
	inv.itemIDs = append(inv.itemIDs, it.ID)
	f.retotal(a, inv)
	return it.ID
}

func (f *Fake) transition(accountID, id, status, at, eventType string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	a := f.acct(accountID)
	inv, ok := a.invoices[id]
	if !ok || inv.Status != "open" {
		return
	}
	inv.Status = status
	inv.StatusTransitions[at] = f.clock().Unix()
	f.emit(a, eventType, inv)
}

func (f *Fake) acct(id string) *account {
	a, ok := f.state[id]
	if !ok {
		a = &account{customers: map[string]*customer{}, invoices: map[string]*invoice{}, items: map[string]*item{}, coupons: map[string]*coupon{}, redeemed: map[string][]string{}}
		f.state[id] = a
	}
	return a
}

func (f *Fake) next(prefix string) string {
	f.seq[prefix]++
	return fmt.Sprintf("%s_%d", prefix, f.seq[prefix])
}

func (f *Fake) emit(a *account, eventType string, inv *invoice) {
	a.events = append(a.events, &event{
		ID: f.next("evt"), Object: "event", Type: eventType, Created: f.clock().Unix(),
		Data: map[string]any{"object": map[string]any{"id": inv.ID, "object": "invoice", "status": inv.Status}},
	})
}

func (f *Fake) finalize(a *account, inv *invoice) {
	n := strings.TrimPrefix(inv.ID, "in_")
	inv.Status = "open"
	inv.Number = "KAI-" + n
	inv.HostedInvoiceURL = "https://invoice.stripe.test/i/" + inv.ID
	inv.InvoicePDF = "https://pay.stripe.test/" + inv.ID + "/pdf"
	inv.StatusTransitions["finalized_at"] = f.clock().Unix()
	if inv.CollectionMethod == "send_invoice" {
		inv.DueDate = inv.Created + inv.DaysUntilDue*86400
	}
	f.emit(a, "invoice.finalized", inv)
}

// retotal totals an invoice as Stripe does: the subtotal has the item-level
// discounts already taken off -- only an invoice-level discount, which Kaiten
// never sends, would come after it -- and so has the total excluding tax (the
// fake computes no tax). Measured against Stripe test mode: TestStripeSpike.
func (f *Fake) retotal(a *account, inv *invoice) {
	var sum, discounted int64
	for _, id := range inv.itemIDs {
		sum += a.items[id].Amount
		for _, d := range f.discountAmounts(a, a.items[id]) {
			discounted += d.amount
		}
	}
	inv.Subtotal, inv.TotalExcludingTax, inv.Total = sum-discounted, sum-discounted, sum-discounted
}

type discountAmount struct {
	discount itemDiscount
	amount   int64
}

// discountAmounts applies an item's coupons in order, none taking it below
// 0. A coupon deleted after it was applied keeps applying.
func (f *Fake) discountAmounts(a *account, it *item) []discountAmount {
	left := it.Amount
	out := make([]discountAmount, 0, len(it.discounts))
	for _, d := range it.discounts {
		var take int64
		if c, ok := a.coupons[d.Coupon]; ok {
			take = min(c.AmountOff, left)
		}
		if override, ok := it.applied[d.ID]; ok {
			take = override
		}
		left -= take
		out = append(out, discountAmount{discount: d, amount: take})
	}
	return out
}

// redemptions counts the live items bearing a coupon.
func (f *Fake) redemptions(a *account, couponID string) int64 {
	var n int64
	for _, invoiceID := range a.redeemed[couponID] {
		if inv, ok := a.invoices[invoiceID]; ok && !inv.deleted {
			n++
		}
	}
	return n
}

// StripCoupons removes every coupon from an item, as a human editing a draft
// under review would.
func (f *Fake) StripCoupons(accountID, itemID string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	a := f.acct(accountID)
	if it, ok := a.items[itemID]; ok {
		it.discounts, it.Discounts = nil, nil
		f.retotal(a, a.invoices[it.Invoice])
	}
}

// Heal drops the failures still queued for op.
func (f *Fake) Heal(op string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.faults, op)
}

// CreateCoupon creates an amount_off coupon directly, as an earlier attempt
// whose key Stripe has forgotten would have left it.
func (f *Fake) CreateCoupon(accountID, id string, amountOff int64, currency, kaitenInvoiceID string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.acct(accountID).coupons[id] = &coupon{
		ID: id, Object: "coupon", AmountOff: amountOff, Currency: currency, Duration: "once", MaxRedemptions: 1,
		Metadata: map[string]string{"kaiten_invoice_id": kaitenInvoiceID}, Valid: true, Created: f.clock().Unix(),
	}
}

// Coupons lists the ids of an account's live coupons, sorted.
func (f *Fake) Coupons(accountID string) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []string
	for id, c := range f.acct(accountID).coupons {
		if !c.deleted {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}

// Coupon returns a live coupon's amount, currency, duration and redemption
// limit.
func (f *Fake) Coupon(accountID, id string) (amountOff int64, currency, duration string, maxRedemptions int64, ok bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	c, found := f.acct(accountID).coupons[id]
	if !found || c.deleted {
		return 0, "", "", 0, false
	}
	return c.AmountOff, c.Currency, c.Duration, c.MaxRedemptions, true
}

// ItemCoupons lists the coupons an item bears, in order.
func (f *Fake) ItemCoupons(accountID, itemID string) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	it, ok := f.acct(accountID).items[itemID]
	if !ok {
		return nil
	}
	out := make([]string, len(it.discounts))
	for i, d := range it.discounts {
		out[i] = d.Coupon
	}
	return out
}

// ItemsOf lists the items of an invoice, in order.
func (f *Fake) ItemsOf(accountID, invoiceID string) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	inv, ok := f.acct(accountID).invoices[invoiceID]
	if !ok {
		return nil
	}
	return append([]string(nil), inv.itemIDs...)
}

// ApplyForeignCoupon creates a coupon Kaiten did not create and applies it to
// an item, as a human applying a coupon in the dashboard would.
func (f *Fake) ApplyForeignCoupon(accountID, itemID string, amountOff int64) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	a := f.acct(accountID)
	it, ok := a.items[itemID]
	if !ok {
		return ""
	}
	c := &coupon{
		ID: f.next("co"), Object: "coupon", AmountOff: amountOff, Currency: it.Currency, Duration: "once",
		Metadata: map[string]string{}, Valid: true, Created: f.clock().Unix(),
	}
	a.coupons[c.ID] = c
	it.discounts = append(it.discounts, itemDiscount{ID: f.next("di"), Coupon: c.ID})
	f.retotal(a, a.invoices[it.Invoice])
	return c.ID
}

// SetDiscountAmount changes what a coupon takes off an item, as a Stripe
// computing it differently would.
func (f *Fake) SetDiscountAmount(accountID, itemID, couponID string, amount int64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	a := f.acct(accountID)
	it, ok := a.items[itemID]
	if !ok {
		return
	}
	for _, d := range it.discounts {
		if d.Coupon == couponID {
			if it.applied == nil {
				it.applied = map[string]int64{}
			}
			it.applied[d.ID] = amount
		}
	}
	f.retotal(a, a.invoices[it.Invoice])
}

package stripe

import (
	"context"
	"fmt"
	"os"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	stripego "github.com/stripe/stripe-go/v87"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
)

// TestStripeSpike checks, against Stripe's own test mode, what this adapter
// assumes of Stripe: the CR-001 sandbox checks (§7) and the spike items of
// §12.4 and §12.5. It runs with KAITEN_STRIPE_TEST_KEY (an rk_test_ key)
// and is skipped otherwise; the nightly "Stripe sandbox" workflow runs it.
//
// A check the implementation relies on fails the run when Stripe disagrees.
// A spike question is answered as a finding: logged, and written as markdown
// to KAITEN_STRIPE_SPIKE_REPORT when that is set.
//
// The account needs Stripe Tax active in test mode (Settings > Tax, with a
// head office address), and the key the permissions the connector documents.
func TestStripeSpike(t *testing.T) {
	s := newSpike(t)
	t.Cleanup(s.report)

	t.Run("CR-001 §7.1, §7.3, §7.8: coupons on items under automatic tax, then deleted (§7.4)", s.couponsUnderAutomaticTax)
	t.Run("CR-001 §7.4: a coupon deleted while the invoice is a draft", s.couponDeletedOnADraft)
	t.Run("CR-001 §7.6: inclusive tax reconciles on the subtotal", s.inclusiveTax)
	t.Run("CR-001 §7.7: an automatic charge takes the total", s.chargeAutomatically)
	t.Run("CR-001 §7.2: discounts on one item", s.discountsPerItem)
	t.Run("CR-001: an item re-created takes a fresh coupon", s.itemDeletedFreesItsCoupon)
	t.Run("§12.4 rule 4: what days_until_due counts from", s.dueDateSemantics)
	t.Run("§12.5: days_until_due = 0", s.zeroDaysUntilDue)
	t.Run("§12.5 spike 1: tax ids and customer updates in a setup session", s.setupSessionOptions)
	t.Run("§8.5 rule 6: the currencies Kaiten refuses", s.refusedCurrencies)
}

type spike struct {
	t        *testing.T
	key      string
	adapter  *Adapter
	sc       *stripego.Client
	mu       sync.Mutex
	findings []string
}

func newSpike(t *testing.T) *spike {
	t.Helper()
	key := os.Getenv("KAITEN_STRIPE_TEST_KEY")
	if !strings.HasPrefix(key, "rk_test_") {
		t.Skip("KAITEN_STRIPE_TEST_KEY (an rk_test_ key) is not set")
	}
	adapter := New(Options{})
	return &spike{t: t, key: key, adapter: adapter, sc: adapter.client(&Settings{SecretKey: key})}
}

// finding records what Stripe answered to a spike question.
func (s *spike) finding(t *testing.T, format string, args ...any) {
	t.Helper()
	line := fmt.Sprintf(format, args...)
	t.Log("FINDING " + line)
	s.mu.Lock()
	s.findings = append(s.findings, "- **"+t.Name()+"**: "+line)
	s.mu.Unlock()
}

func (s *spike) report() {
	path := os.Getenv("KAITEN_STRIPE_SPIKE_REPORT")
	if path == "" || len(s.findings) == 0 {
		return
	}
	body := "# Stripe sandbox findings, " + time.Now().UTC().Format("2006-01-02") + "\n\n" + strings.Join(s.findings, "\n") + "\n"
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil { //nolint:gosec // the path is the CI job's own setting
		s.t.Logf("could not write the spike report: %v", err)
	}
}

func (s *spike) ref(settings Settings) provider.Ref {
	settings.SecretKey = s.key
	return provider.Ref{OrganizationID: uuid.New(), Settings: &settings}
}

// customer is a new Stripe customer with a French address, which automatic
// tax needs, deleted when the test ends.
func (s *spike) customer(t *testing.T, ref provider.Ref) string {
	t.Helper()
	ctx := context.Background()
	record, err := s.adapter.EnsureCustomer(ctx, ref, provider.Customer{
		CustomerID: uuid.New(), ExternalID: "", Name: "Kaiten sandbox", Email: "sandbox@kaiten.test", Metadata: nil, RecreateOf: "",
	})
	if err != nil {
		t.Fatalf("EnsureCustomer: %v", err)
	}
	address := &stripego.CustomerUpdateParams{Address: &stripego.AddressParams{
		Line1: stripego.String("1 rue de Rivoli"), City: stripego.String("Paris"),
		PostalCode: stripego.String("75001"), Country: stripego.String("FR"),
	}}
	if _, err := s.sc.V1Customers.Update(ctx, record.ExternalID, address); err != nil {
		t.Fatalf("set the customer's address: %v", err)
	}
	t.Cleanup(func() { _, _ = s.sc.V1Customers.Delete(context.Background(), record.ExternalID, nil) })
	return record.ExternalID
}

func invoiceFor(customerID, currency, method string, days *int32, lines ...provider.NormalizedLine) provider.NormalizedInvoice {
	var total int64
	for _, l := range lines {
		total += l.AmountMinor
	}
	return provider.NormalizedInvoice{
		KaitenInvoiceID: uuid.New(), ExternalCustomerID: customerID, Kind: "RENEWAL", BoundaryAt: time.Now().UTC(),
		Currency: currency, CollectionMethod: method, DaysUntilDue: days, Lines: lines, Discounts: nil,
		TotalMinor: total, Metadata: map[string]string{"kaiten_sandbox": "true"},
	}
}

func lineOf(seq int, amount int64) provider.NormalizedLine {
	from := time.Now().UTC().Truncate(time.Second)
	return provider.NormalizedLine{
		LineID: uuid.New(), Seq: seq, AmountMinor: amount, Description: fmt.Sprintf("sandbox line %d", seq),
		ServiceFrom: from, ServiceTo: from.AddDate(0, 1, 0), Discounts: nil, Recreation: 0,
	}
}

// push creates the draft, its coupons and its items, the way the push does,
// and voids or deletes it when the test ends.
func (s *spike) push(t *testing.T, ref provider.Ref, in *provider.NormalizedInvoice) string {
	t.Helper()
	ctx := context.Background()
	draft, err := s.adapter.CreateDraft(ctx, ref, *in)
	if err != nil {
		t.Fatalf("CreateDraft: %v", err)
	}
	t.Cleanup(func() { _ = s.adapter.VoidInvoice(context.Background(), ref, draft.ExternalID) })
	ids := map[[2]int]string{}
	for _, d := range in.Discounts {
		id, err := s.adapter.AddDiscount(ctx, ref, draft.ExternalID, *in, d)
		if err != nil {
			t.Fatalf("AddDiscount %d→%d: %v", d.Seq, d.TargetSeq, err)
		}
		ids[[2]int{d.Seq, d.TargetSeq}] = id
		t.Cleanup(func() { _ = s.adapter.DeleteDiscount(context.Background(), ref, id) })
	}
	for i := range in.Lines {
		line := &in.Lines[i]
		line.Discounts = nil
		for _, d := range in.Discounts {
			if d.TargetSeq == line.Seq {
				line.Discounts = append(line.Discounts, provider.LineDiscount{Seq: d.Seq, ExternalID: ids[[2]int{d.Seq, d.TargetSeq}], AmountMinor: d.AmountMinor})
			}
		}
		if _, err := s.adapter.AddLine(ctx, ref, draft.ExternalID, *in, *line); err != nil {
			t.Fatalf("AddLine %d: %v", line.Seq, err)
		}
	}
	return draft.ExternalID
}

// discounted is CR-001's §3.4 example: a 29.00 base bearing 5.80 and 5.00.
func discounted(customerID, method string) provider.NormalizedInvoice {
	var days *int32
	if method == "SEND_INVOICE" {
		thirty := int32(30)
		days = &thirty
	}
	in := invoiceFor(customerID, "EUR", method, days, lineOf(1, 2900))
	voucher, launch, welcome := uuid.New(), uuid.New(), uuid.New()
	in.Discounts = []provider.NormalizedDiscount{
		{LineID: launch, Seq: 2, TargetSeq: 1, AmountMinor: 580, Label: "LAUNCH20 −20%", VoucherID: voucher},
		{LineID: welcome, Seq: 3, TargetSeq: 1, AmountMinor: 500, Label: "WELCOME-5 −5.00 EUR", VoucherID: voucher},
	}
	in.TotalMinor = 1820
	return in
}

func discountAmounts(line provider.Line) []int64 {
	out := make([]int64, 0, len(line.Discounts))
	for _, d := range line.Discounts {
		out = append(out, d.AmountMinor)
	}
	slices.Sort(out)
	return out
}

func (s *spike) couponsUnderAutomaticTax(t *testing.T) {
	ctx := context.Background()
	ref := s.ref(Settings{AutomaticTax: true, TaxBehavior: TaxExclusive, AutoFinalize: true})
	in := discounted(s.customer(t, ref), "SEND_INVOICE")
	id := s.push(t, ref, &in)
	finalized, err := s.adapter.Finalize(ctx, ref, id, in)
	if err != nil {
		t.Fatalf("an invoice under automatic tax with coupons on its item does not finalize: %v", err)
	}
	if finalized.TotalExcludingTax != 1820 {
		t.Errorf("total_excluding_tax = %d, want 1820 (2900 − 580 − 500)", finalized.TotalExcludingTax)
	}
	if got := discountAmounts(finalized.Lines[0]); !slices.Equal(got, []int64{500, 580}) {
		t.Errorf("the item's discount amounts are %v, want [500 580]", got)
	}
	raw, err := s.sc.V1Invoices.Retrieve(ctx, id, nil)
	if err != nil {
		t.Fatalf("read the invoice: %v", err)
	}
	status := ""
	if raw.AutomaticTax != nil {
		status = string(raw.AutomaticTax.Status)
	}
	s.finding(t, "accepted; automatic tax %q, tax %d on a total excluding tax of %d; hosted page %s (check each discount shows on its line, §7.5)",
		status, raw.Total-raw.TotalExcludingTax, raw.TotalExcludingTax, raw.HostedInvoiceURL)

	for _, d := range in.Discounts {
		if err := s.adapter.DeleteDiscount(ctx, ref, CouponID(in.KaitenInvoiceID, d.Seq, d.TargetSeq)); err != nil {
			t.Fatalf("DeleteDiscount: %v", err)
		}
	}
	after, err := s.adapter.GetInvoice(ctx, ref, id)
	if err != nil {
		t.Fatalf("read the invoice back: %v", err)
	}
	if after.TotalExcludingTax != finalized.TotalExcludingTax || !slices.Equal(discountAmounts(after.Lines[0]), discountAmounts(finalized.Lines[0])) {
		t.Errorf("deleting the coupons changed the finalized invoice: %+v, was %+v", after, finalized)
	}
	s.finding(t, "deleting the coupons after finalization left the totals and discount amounts unchanged; PDF to check by hand: %s", after.PDFURL)
}

func (s *spike) couponDeletedOnADraft(t *testing.T) {
	ctx := context.Background()
	ref := s.ref(Settings{AutomaticTax: false, TaxBehavior: TaxExclusive, AutoFinalize: true})
	in := discounted(s.customer(t, ref), "SEND_INVOICE")
	id := s.push(t, ref, &in)
	if err := s.adapter.DeleteDiscount(ctx, ref, CouponID(in.KaitenInvoiceID, 2, 1)); err != nil {
		t.Fatalf("DeleteDiscount: %v", err)
	}
	draft, err := s.adapter.GetInvoice(ctx, ref, id)
	if err != nil {
		t.Fatalf("read the draft: %v", err)
	}
	finalized, err := s.adapter.Finalize(ctx, ref, id, in)
	if err != nil {
		s.finding(t, "the draft no longer finalizes once a coupon it bears is deleted: %v", err)
		return
	}
	s.finding(t, "on the draft the discounts became %v (total %d); finalized, %v (total %d)",
		discountAmounts(draft.Lines[0]), draft.TotalExcludingTax, discountAmounts(finalized.Lines[0]), finalized.TotalExcludingTax)
}

func (s *spike) inclusiveTax(t *testing.T) {
	ctx := context.Background()
	ref := s.ref(Settings{AutomaticTax: true, TaxBehavior: TaxInclusive, AutoFinalize: true})
	in := discounted(s.customer(t, ref), "SEND_INVOICE")
	id := s.push(t, ref, &in)
	finalized, err := s.adapter.Finalize(ctx, ref, id, in)
	if err != nil {
		t.Fatalf("Finalize: %v", err)
	}
	// Item-level discounts are already off the subtotal: the subtotal is the
	// tax-inclusive total Kaiten composed.
	if finalized.Subtotal != 1820 {
		t.Errorf("subtotal %d (discounts %d), want 1820: the INCLUSIVE reconciliation compares Kaiten's total with the subtotal",
			finalized.Subtotal, finalized.TotalDiscount)
	}
	s.finding(t, "subtotal %d, discounts %d, total excluding tax %d", finalized.Subtotal, finalized.TotalDiscount, finalized.TotalExcludingTax)
}

func (s *spike) chargeAutomatically(t *testing.T) {
	ctx := context.Background()
	ref := s.ref(Settings{AutomaticTax: true, TaxBehavior: TaxExclusive, AutoFinalize: true})
	customerID := s.customer(t, ref)
	card, err := s.sc.V1PaymentMethods.Attach(ctx, "pm_card_visa", &stripego.PaymentMethodAttachParams{Customer: stripego.String(customerID)})
	if err != nil {
		t.Fatalf("attach a test card: %v", err)
	}
	if _, err := s.adapter.SetDefaultPaymentMethod(ctx, ref, customerID, card.ID); err != nil {
		t.Fatalf("SetDefaultPaymentMethod: %v", err)
	}
	in := discounted(customerID, "CHARGE_AUTOMATICALLY")
	id := s.push(t, ref, &in)
	if _, err := s.adapter.Finalize(ctx, ref, id, in); err != nil {
		t.Fatalf("Finalize: %v", err)
	}
	outcome, err := s.adapter.Pay(ctx, ref, id, in)
	if err != nil {
		t.Fatalf("Pay: %v", err)
	}
	if outcome.Status != provider.PaymentPaid {
		t.Fatalf("the charge was %s (%s), not paid", outcome.Status, outcome.Code)
	}
	raw, err := s.sc.V1Invoices.Retrieve(ctx, id, nil)
	if err != nil {
		t.Fatalf("read the invoice: %v", err)
	}
	if raw.AmountPaid != raw.Total {
		t.Errorf("amount_paid = %d, total = %d: the charge did not take the total", raw.AmountPaid, raw.Total)
	}
	s.finding(t, "charged %d, the total after discounts and tax (total excluding tax %d)", raw.AmountPaid, raw.TotalExcludingTax)
}

func (s *spike) discountsPerItem(t *testing.T) {
	ctx := context.Background()
	ref := s.ref(Settings{AutomaticTax: false, TaxBehavior: TaxExclusive, AutoFinalize: true})
	customerID := s.customer(t, ref)
	for _, n := range []int{20, 21, 50} {
		thirty := int32(30)
		in := invoiceFor(customerID, "EUR", "SEND_INVOICE", &thirty, lineOf(1, 100_000))
		for i := range n {
			in.Discounts = append(in.Discounts, provider.NormalizedDiscount{
				LineID: uuid.New(), Seq: 2 + i, TargetSeq: 1, AmountMinor: 1, Label: fmt.Sprintf("D%d", i), VoucherID: uuid.New(),
			})
		}
		draft, err := s.adapter.CreateDraft(ctx, ref, in)
		if err != nil {
			t.Fatalf("CreateDraft: %v", err)
		}
		t.Cleanup(func() { _ = s.adapter.VoidInvoice(context.Background(), ref, draft.ExternalID) })
		line := in.Lines[0]
		for _, d := range in.Discounts {
			id, err := s.adapter.AddDiscount(ctx, ref, draft.ExternalID, in, d)
			if err != nil {
				t.Fatalf("AddDiscount: %v", err)
			}
			t.Cleanup(func() { _ = s.adapter.DeleteDiscount(context.Background(), ref, id) })
			line.Discounts = append(line.Discounts, provider.LineDiscount{Seq: d.Seq, ExternalID: id, AmountMinor: 1})
		}
		if _, err := s.adapter.AddLine(ctx, ref, draft.ExternalID, in, line); err != nil {
			s.finding(t, "an item with %d discounts is refused: %v", n, err)
			return
		}
		s.finding(t, "an item with %d discounts is accepted", n)
	}
}

func (s *spike) itemDeletedFreesItsCoupon(t *testing.T) {
	ctx := context.Background()
	ref := s.ref(Settings{AutomaticTax: false, TaxBehavior: TaxExclusive, AutoFinalize: true})
	thirty := int32(30)
	in := invoiceFor(s.customer(t, ref), "EUR", "SEND_INVOICE", &thirty, lineOf(1, 2900))
	in.Discounts = []provider.NormalizedDiscount{{LineID: uuid.New(), Seq: 2, TargetSeq: 1, AmountMinor: 580, Label: "LAUNCH20", VoucherID: uuid.New()}}
	draft, err := s.adapter.CreateDraft(ctx, ref, in)
	if err != nil {
		t.Fatalf("CreateDraft: %v", err)
	}
	t.Cleanup(func() { _ = s.adapter.VoidInvoice(context.Background(), ref, draft.ExternalID) })
	coupon, err := s.adapter.AddDiscount(ctx, ref, draft.ExternalID, in, in.Discounts[0])
	if err != nil {
		t.Fatalf("AddDiscount: %v", err)
	}
	t.Cleanup(func() { _ = s.adapter.DeleteDiscount(context.Background(), ref, coupon) })
	line := in.Lines[0]
	line.Discounts = []provider.LineDiscount{{Seq: 2, ExternalID: coupon, AmountMinor: 580}}
	item, err := s.adapter.AddLine(ctx, ref, draft.ExternalID, in, line)
	if err != nil {
		t.Fatalf("AddLine: %v", err)
	}
	if err := s.adapter.DeleteLine(ctx, ref, draft.ExternalID, item); err != nil {
		t.Fatalf("DeleteLine: %v", err)
	}
	line.Recreation = 1
	if _, err := s.adapter.AddLine(ctx, ref, draft.ExternalID, in, line); err == nil {
		s.finding(t, "deleting an item now frees its coupon's single redemption: the push's fresh coupons are no longer needed")
	} else {
		s.finding(t, "an item re-created with the deleted item's coupon is refused (%v): the push gives it fresh coupons", err)
	}

	// What the push does: a fresh coupon for the item added again.
	again := in.Discounts[0]
	again.Recreation = 1
	fresh, err := s.adapter.AddDiscount(ctx, ref, draft.ExternalID, in, again)
	if err != nil {
		t.Fatalf("AddDiscount (recreation): %v", err)
	}
	t.Cleanup(func() { _ = s.adapter.DeleteDiscount(context.Background(), ref, fresh) })
	if fresh != RecreatedCouponID(in.KaitenInvoiceID, 2, 1, 1) {
		t.Errorf("the fresh coupon is %q", fresh)
	}
	line.Recreation = 2
	line.Discounts = []provider.LineDiscount{{Seq: 2, ExternalID: fresh, AmountMinor: 580}}
	if _, err := s.adapter.AddLine(ctx, ref, draft.ExternalID, in, line); err != nil {
		t.Errorf("an item re-created with a fresh coupon is refused: %v", err)
	}
}

func (s *spike) dueDateSemantics(t *testing.T) {
	ctx := context.Background()
	ref := s.ref(Settings{AutomaticTax: false, TaxBehavior: TaxExclusive, AutoFinalize: true})
	thirty := int32(30)
	in := invoiceFor(s.customer(t, ref), "EUR", "SEND_INVOICE", &thirty, lineOf(1, 2900))
	id := s.push(t, ref, &in)
	time.Sleep(5 * time.Second) // a gap between creation and finalization that the due date shows
	if _, err := s.adapter.Finalize(ctx, ref, id, in); err != nil {
		t.Fatalf("Finalize: %v", err)
	}
	raw, err := s.sc.V1Invoices.Retrieve(ctx, id, nil)
	if err != nil {
		t.Fatalf("read the invoice: %v", err)
	}
	var finalizedAt int64
	if raw.StatusTransitions != nil {
		finalizedAt = raw.StatusTransitions.FinalizedAt
	}
	days := int64(30 * 24 * 3600)
	switch raw.DueDate {
	case finalizedAt + days:
		s.finding(t, "days_until_due counts from the finalization: Kaiten's due_at matches, no due_date update is needed")
	case raw.Created + days:
		s.finding(t, "days_until_due counts from the draft's creation: §12.4 rule 4's due_date update before the finalization is needed")
	default:
		s.finding(t, "due_date %d is neither created + 30 days (%d) nor finalized + 30 days (%d)", raw.DueDate, raw.Created+days, finalizedAt+days)
	}
}

func (s *spike) zeroDaysUntilDue(t *testing.T) {
	ref := s.ref(Settings{AutomaticTax: false, TaxBehavior: TaxExclusive, AutoFinalize: true})
	zero := int32(0)
	in := invoiceFor(s.customer(t, ref), "EUR", "SEND_INVOICE", &zero, lineOf(1, 2900))
	draft, err := s.adapter.CreateDraft(context.Background(), ref, in)
	if err != nil {
		s.finding(t, "a SEND_INVOICE draft with days_until_due = 0 is refused: %v", err)
		return
	}
	t.Cleanup(func() { _ = s.adapter.VoidInvoice(context.Background(), ref, draft.ExternalID) })
	s.finding(t, "a SEND_INVOICE draft with days_until_due = 0 is accepted")
}

func (s *spike) setupSessionOptions(t *testing.T) {
	ref := s.ref(Settings{AutomaticTax: false, TaxBehavior: TaxExclusive, AutoFinalize: true})
	customerID := s.customer(t, ref)
	_, err := s.sc.V1CheckoutSessions.Create(context.Background(), &stripego.CheckoutSessionCreateParams{
		Mode: stripego.String("setup"), Customer: stripego.String(customerID), Currency: stripego.String("eur"),
		SuccessURL:               stripego.String("https://sandbox.kaiten.test/billing?kaiten_setup_session={CHECKOUT_SESSION_ID}"),
		CancelURL:                stripego.String("https://sandbox.kaiten.test/billing"),
		BillingAddressCollection: stripego.String("required"),
		TaxIDCollection:          &stripego.CheckoutSessionCreateTaxIDCollectionParams{Enabled: stripego.Bool(true)},
		CustomerUpdate: &stripego.CheckoutSessionCreateCustomerUpdateParams{
			Address: stripego.String("auto"), Name: stripego.String("auto"),
		},
	})
	if err != nil {
		s.finding(t, "a setup session with tax_id_collection and customer_update is refused: %v; collect tax ids in the portal", err)
		return
	}
	s.finding(t, "a setup session accepts tax_id_collection and customer_update: the payment-method session can send them, as §12.5 has it")
}

func (s *spike) refusedCurrencies(t *testing.T) {
	ctx := context.Background()
	ref := s.ref(Settings{AutomaticTax: false, TaxBehavior: TaxExclusive, AutoFinalize: true})
	thirty := int32(30)
	for _, currency := range RefusedCurrencies {
		in := invoiceFor(s.customer(t, ref), currency, "SEND_INVOICE", &thirty, lineOf(1, 12_345))
		draft, err := s.adapter.CreateDraft(ctx, ref, in)
		if err != nil {
			s.finding(t, "%s: the draft is refused: %v", currency, err)
			continue
		}
		t.Cleanup(func() { _ = s.adapter.VoidInvoice(context.Background(), ref, draft.ExternalID) })
		if _, err := s.adapter.AddLine(ctx, ref, draft.ExternalID, in, in.Lines[0]); err != nil {
			s.finding(t, "%s: an item of 12345 minor units is refused: %v", currency, err)
			continue
		}
		read, err := s.adapter.GetInvoice(ctx, ref, draft.ExternalID)
		if err != nil {
			t.Fatalf("read the draft: %v", err)
		}
		s.finding(t, "%s: an item of 12345 minor units is accepted, total excluding tax %d", currency, read.TotalExcludingTax)
	}
}

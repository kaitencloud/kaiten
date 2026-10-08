package stripe_test

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	connectorstripe "github.com/kaitencloud/kaiten/api/internal/modules/connectors/stripe"
)

const key = "rk_test_A1"

type fixture struct {
	fake    *stripefake.Fake
	adapter *stripe.Adapter
	ref     provider.Ref
	ctx     context.Context
}

func newFixture(t *testing.T, settings stripe.Settings) fixture {
	t.Helper()
	fake := stripefake.New(t)
	if settings.SecretKey == "" {
		settings.SecretKey = key
	}
	if settings.TaxBehavior == "" {
		settings.TaxBehavior = stripe.TaxExclusive
	}
	return fixture{
		fake:    fake,
		adapter: stripe.New(stripe.Options{BaseURL: fake.URL(), HTTPClient: fake.Client()}),
		ref:     provider.Ref{OrganizationID: uuid.New(), Settings: &settings},
		ctx:     context.Background(),
	}
}

func (f fixture) customer(t *testing.T) (provider.Customer, string) {
	t.Helper()
	c := provider.Customer{
		CustomerID: uuid.New(), Name: "Acme Corp", Email: "ap@acme.test",
		Metadata: map[string]string{"kaiten_customer_id": "c", "kaiten_organization_id": "o"},
	}
	record, err := f.adapter.EnsureCustomer(f.ctx, f.ref, c)
	require.NoError(t, err)
	c.ExternalID = record.ExternalID
	return c, record.ExternalID
}

func invoiceFor(customerID string, currency string, lines ...provider.NormalizedLine) provider.NormalizedInvoice {
	days := int32(30)
	var total int64
	for _, l := range lines {
		total += l.AmountMinor
	}
	return provider.NormalizedInvoice{
		KaitenInvoiceID: uuid.New(), ExternalCustomerID: customerID, Kind: "RENEWAL",
		BoundaryAt: time.Date(2027, 3, 1, 0, 0, 0, 0, time.UTC), Currency: currency, CollectionMethod: "SEND_INVOICE",
		DaysUntilDue: &days, Lines: lines, TotalMinor: total,
		Metadata: map[string]string{"kaiten_organization_id": "o", "kind": "RENEWAL"},
	}
}

func line(seq int, amount int64) provider.NormalizedLine {
	from := time.Date(2027, 3, 1, 0, 0, 0, 0, time.UTC)
	return provider.NormalizedLine{
		LineID: uuid.New(), Seq: seq, AmountMinor: amount, Description: fmt.Sprintf("line %d", seq),
		ServiceFrom: from.Add(500 * time.Millisecond), ServiceTo: from.AddDate(0, 1, 0).Add(999 * time.Millisecond),
	}
}

func TestEnsureCustomerCreatesOnceAndUpdatesTheEmail(t *testing.T) {
	f := newFixture(t, stripe.Settings{})
	c, id := f.customer(t)

	create := f.fake.CallsOf(stripefake.OpCreateCustomer)
	require.Len(t, create, 1)
	require.Equal(t, f.ref.OrganizationID.String()+":customer:"+c.CustomerID.String(), create[0].IdempotencyKey)
	require.Equal(t, "ap@acme.test", create[0].Form.Get("email"))
	require.Equal(t, c.CustomerID.String(), create[0].Form.Get("metadata[kaiten_customer_id]"), "the adapter stamps the ids it searches on")
	require.Equal(t, f.ref.OrganizationID.String(), create[0].Form.Get("metadata[kaiten_organization_id]"))
	require.Equal(t, "Bearer "+key, create[0].Authorization)
	require.NotEmpty(t, create[0].StripeVersion, "the API version is pinned by the library")

	// Same e-mail: a read, no write.
	_, err := f.adapter.EnsureCustomer(f.ctx, f.ref, c)
	require.NoError(t, err)
	require.Equal(t, 0, f.fake.Count(stripefake.OpUpdateCustomer))

	// Changed e-mail: one update under a key of its own.
	c.Email = "billing@acme.test"
	record, err := f.adapter.EnsureCustomer(f.ctx, f.ref, c)
	require.NoError(t, err)
	require.Equal(t, id, record.ExternalID)
	update := f.fake.CallsOf(stripefake.OpUpdateCustomer)
	require.Len(t, update, 1)
	require.Contains(t, update[0].IdempotencyKey, ":email:")
	require.Equal(t, "https://dashboard.stripe.com/test/customers/"+id, record.WebURL)

	// Deleted in Stripe: the customer is missing, and re-creating it uses a key
	// of its own, never the original one (which would answer the deleted one).
	f.fake.DeleteObject(stripefake.DefaultAccount, id)
	_, err = f.adapter.EnsureCustomer(f.ctx, f.ref, c)
	require.Equal(t, provider.ClassCustomerMissing, provider.ClassOf(err))
	c.ExternalID, c.RecreateOf = "", id
	recreated, err := f.adapter.EnsureCustomer(f.ctx, f.ref, c)
	require.NoError(t, err)
	require.NotEqual(t, id, recreated.ExternalID)
	require.True(t, strings.HasSuffix(f.fake.CallsOf(stripefake.OpCreateCustomer)[1].IdempotencyKey, ":recreate:"+id))
}

// A customer whose create answer was lost beyond the 24-hour key horizon is
// found by its Kaiten ids and adopted, not created twice (S09-G07); one of
// another organization is never adopted.
func TestEnsureCustomerAdoptsACustomerItLostTrackOf(t *testing.T) {
	f := newFixture(t, stripe.Settings{})
	c, id := f.customer(t)

	f.fake.ForgetKeys()
	lost := c
	lost.ExternalID = "" // Kaiten never recorded it
	adopted, err := f.adapter.EnsureCustomer(f.ctx, f.ref, lost)
	require.NoError(t, err)
	require.Equal(t, id, adopted.ExternalID)
	require.Equal(t, 1, f.fake.Count(stripefake.OpCreateCustomer), "no second customer")
	require.Equal(t, 1, f.fake.Customers(stripefake.DefaultAccount))

	other := f.ref
	other.OrganizationID = uuid.New()
	created, err := f.adapter.EnsureCustomer(f.ctx, other, lost)
	require.NoError(t, err)
	require.NotEqual(t, id, created.ExternalID, "another organization's customer is its own")
}

// The SEND_INVOICE push: exact parameters and keys (S09-024), integer minor
// units in exponent-2 and exponent-0 currencies (S09-028), periods floored
// to seconds (S09-030). A 10.74 discount over both lines reaches Stripe as
// two coupons on their items, under automatic tax, which refuses a negative
// item (CR-001).
func TestPushParametersAndKeys(t *testing.T) {
	for _, currency := range []string{"EUR", "JPY"} {
		t.Run(currency, func(t *testing.T) {
			f := newFixture(t, stripe.Settings{AutomaticTax: true, TaxBehavior: stripe.TaxInclusive})
			_, customerID := f.customer(t)
			in := invoiceFor(customerID, currency, line(1, 9900), line(2, 840))
			discountLine := uuid.New()
			voucher := uuid.New()
			in.Discounts = []provider.NormalizedDiscount{
				{LineID: discountLine, Seq: 3, TargetSeq: 1, AmountMinor: 1000, Label: "LAUNCH — a launch offer with a long name", VoucherID: voucher},
				{LineID: discountLine, Seq: 3, TargetSeq: 2, AmountMinor: 74, Label: "LAUNCH — a launch offer with a long name", VoucherID: voucher},
			}
			in.TotalMinor = 9666

			draft, err := f.adapter.CreateDraft(f.ctx, f.ref, in)
			require.NoError(t, err)
			create := f.fake.CallsOf(stripefake.OpCreateInvoice)[0]
			require.Equal(t, in.KaitenInvoiceID.String()+":draft", create.IdempotencyKey)
			require.Equal(t, strings.ToLower(currency), create.Form.Get("currency"))
			require.Equal(t, "send_invoice", create.Form.Get("collection_method"))
			require.Equal(t, "30", create.Form.Get("days_until_due"))
			require.Equal(t, "false", create.Form.Get("auto_advance"))
			require.Equal(t, "exclude", create.Form.Get("pending_invoice_items_behavior"))
			require.Equal(t, "true", create.Form.Get("automatic_tax[enabled]"))
			require.Equal(t, in.KaitenInvoiceID.String(), create.Form.Get("metadata[kaiten_invoice_id]"))
			require.Equal(t, "INCLUSIVE", create.Form.Get("metadata[kaiten_tax_behavior]"))
			require.Equal(t, "RENEWAL", create.Form.Get("metadata[kind]"))

			coupons := map[int]string{}
			for _, d := range in.Discounts {
				id, err := f.adapter.AddDiscount(f.ctx, f.ref, draft.ExternalID, in, d)
				require.NoError(t, err)
				coupons[d.TargetSeq] = id
			}
			hex := strings.ReplaceAll(in.KaitenInvoiceID.String(), "-", "")
			require.Equal(t, "kt_"+hex+"_3_1", coupons[1], "deterministic coupon ids")
			calls := f.fake.CallsOf(stripefake.OpCreateCoupon)
			require.Len(t, calls, 2)
			for i, call := range calls {
				d := in.Discounts[i]
				require.Equal(t, fmt.Sprintf("%s:coupon:3:%d", in.KaitenInvoiceID, d.TargetSeq), call.IdempotencyKey)
				require.Equal(t, coupons[d.TargetSeq], call.Form.Get("id"))
				require.Equal(t, fmt.Sprint(d.AmountMinor), call.Form.Get("amount_off"))
				require.Equal(t, strings.ToLower(currency), call.Form.Get("currency"))
				require.Equal(t, "once", call.Form.Get("duration"))
				require.Equal(t, "1", call.Form.Get("max_redemptions"))
				require.Len(t, []rune(call.Form.Get("name")), 40, "the name is truncated to Stripe's 40 characters")
				require.Equal(t, in.KaitenInvoiceID.String(), call.Form.Get("metadata[kaiten_invoice_id]"))
				require.Equal(t, discountLine.String(), call.Form.Get("metadata[kaiten_line_id]"))
				require.Equal(t, "3", call.Form.Get("metadata[kaiten_line_seq]"))
				require.Equal(t, fmt.Sprint(d.TargetSeq), call.Form.Get("metadata[kaiten_target_seq]"))
				require.Equal(t, voucher.String(), call.Form.Get("metadata[kaiten_voucher_id]"))
			}

			for i := range in.Lines {
				in.Lines[i].Discounts = []provider.LineDiscount{{Seq: 3, ExternalID: coupons[in.Lines[i].Seq], AmountMinor: 0}}
				_, err := f.adapter.AddLine(f.ctx, f.ref, draft.ExternalID, in, in.Lines[i])
				require.NoError(t, err)
			}
			items := f.fake.CallsOf(stripefake.OpCreateItem)
			require.Len(t, items, 2)
			for i, item := range items {
				l := in.Lines[i]
				require.Equal(t, fmt.Sprintf("%s:line:%d", in.KaitenInvoiceID, l.Seq), item.IdempotencyKey)
				require.Equal(t, fmt.Sprint(l.AmountMinor), item.Form.Get("amount"))
				require.Equal(t, draft.ExternalID, item.Form.Get("invoice"))
				require.Equal(t, "inclusive", item.Form.Get("tax_behavior"))
				require.Equal(t, fmt.Sprint(l.ServiceFrom.Unix()), item.Form.Get("period[start]"), "floored to the second")
				require.Equal(t, fmt.Sprint(l.ServiceTo.Unix()), item.Form.Get("period[end]"))
				require.Equal(t, l.LineID.String(), item.Form.Get("metadata[kaiten_line_id]"))
				require.Equal(t, fmt.Sprint(l.Seq), item.Form.Get("metadata[kaiten_line_seq]"))
				require.Equal(t, coupons[l.Seq], item.Form.Get("discounts[0][coupon]"))
				require.Empty(t, item.Form.Get("discountable"), "items stay discountable")
			}

			finalized, err := f.adapter.Finalize(f.ctx, f.ref, draft.ExternalID, in)
			require.NoError(t, err)
			require.Equal(t, provider.StatusOpen, finalized.Status)
			require.Equal(t, in.KaitenInvoiceID.String()+":finalize", f.fake.CallsOf(stripefake.OpFinalizeInvoice)[0].IdempotencyKey)
			require.Equal(t, "true", f.fake.CallsOf(stripefake.OpFinalizeInvoice)[0].Form.Get("auto_advance"))
			require.NotNil(t, finalized.FinalizedAt)
			require.NotEmpty(t, finalized.HostedURL)
			require.EqualValues(t, 9666, finalized.TotalExcludingTax)
			require.NotNil(t, finalized.DueAt, "the due date is read back")
			require.WithinDuration(t, finalized.FinalizedAt.Add(30*24*time.Hour), *finalized.DueAt, time.Minute)
			require.EqualValues(t, 10740, finalized.Subtotal)
			require.EqualValues(t, 1074, finalized.TotalDiscount)
			require.Len(t, finalized.Lines, 2)
			require.Equal(t, in.Lines[1].LineID, finalized.Lines[1].KaitenLineID)
			require.Equal(t, currency, finalized.Lines[0].Currency)
			require.EqualValues(t, 9900, finalized.Lines[0].AmountMinor, "a line reads back gross")
			require.Equal(t, []provider.LineDiscount{{Seq: 0, ExternalID: coupons[1], AmountMinor: 1000}}, finalized.Lines[0].Discounts)
			require.Equal(t, []provider.LineDiscount{{Seq: 0, ExternalID: coupons[2], AmountMinor: 74}}, finalized.Lines[1].Discounts)
			require.Equal(t, 0, f.fake.Count(stripefake.OpSendInvoice), "no /send unless configured")
			requireNoNegativeAmount(t, f.fake)
		})
	}
}

// requireNoNegativeAmount: no request the adapter sent carried a negative
// amount (CR-001 §9).
func requireNoNegativeAmount(t *testing.T, fake *stripefake.Fake) {
	t.Helper()
	for _, call := range fake.Calls() {
		for name, values := range call.Form {
			if name != "amount" && name != "amount_off" {
				continue
			}
			for _, v := range values {
				require.False(t, strings.HasPrefix(v, "-"), "%s %s carried %s=%s", call.Method, call.Path, name, v)
			}
		}
	}
}

func TestAddLineRefusesANegativeAmountWithoutCallingStripe(t *testing.T) {
	f := newFixture(t, stripe.Settings{})
	_, customerID := f.customer(t)
	in := invoiceFor(customerID, "EUR", line(1, -1))
	draft, err := f.adapter.CreateDraft(f.ctx, f.ref, in)
	require.NoError(t, err)
	_, err = f.adapter.AddLine(f.ctx, f.ref, draft.ExternalID, in, in.Lines[0])
	require.Error(t, err)
	require.Equal(t, 0, f.fake.Count(stripefake.OpCreateItem))
}

// A coupon whose answer was lost beyond the 24-hour key horizon is adopted by
// its id when it is the same one, and refused as coupon_conflict when not.
func TestAddDiscountBeyondTheKeyHorizon(t *testing.T) {
	f := newFixture(t, stripe.Settings{})
	_, customerID := f.customer(t)
	in := invoiceFor(customerID, "EUR", line(1, 2900))
	d := provider.NormalizedDiscount{LineID: uuid.New(), Seq: 2, TargetSeq: 1, AmountMinor: 580, Label: "LAUNCH20", VoucherID: uuid.New()}
	draft, err := f.adapter.CreateDraft(f.ctx, f.ref, in)
	require.NoError(t, err)
	first, err := f.adapter.AddDiscount(f.ctx, f.ref, draft.ExternalID, in, d)
	require.NoError(t, err)

	f.fake.ForgetKeys()
	again, err := f.adapter.AddDiscount(f.ctx, f.ref, draft.ExternalID, in, d)
	require.NoError(t, err)
	require.Equal(t, first, again)
	require.Equal(t, 1, f.fake.Count(stripefake.OpRetrieveCoupon), "adopted after reading it back")
	require.Len(t, f.fake.Coupons(stripefake.DefaultAccount), 1)

	f.fake.ForgetKeys()
	d.AmountMinor = 600
	_, err = f.adapter.AddDiscount(f.ctx, f.ref, draft.ExternalID, in, d)
	require.Equal(t, provider.ClassRejected, provider.ClassOf(err))
	var providerErr *provider.Error
	require.ErrorAs(t, err, &providerErr)
	require.Equal(t, "coupon_conflict", providerErr.Code)
}

// A re-created item gets a key of its own; deleting an item, or a coupon,
// already gone is a success.
func TestRecreateAndDelete(t *testing.T) {
	f := newFixture(t, stripe.Settings{})
	_, customerID := f.customer(t)
	in := invoiceFor(customerID, "EUR", line(1, 2900))
	draft, err := f.adapter.CreateDraft(f.ctx, f.ref, in)
	require.NoError(t, err)
	item, err := f.adapter.AddLine(f.ctx, f.ref, draft.ExternalID, in, in.Lines[0])
	require.NoError(t, err)
	require.NoError(t, f.adapter.DeleteLine(f.ctx, f.ref, draft.ExternalID, item))
	require.NoError(t, f.adapter.DeleteLine(f.ctx, f.ref, draft.ExternalID, item))

	in.Lines[0].Recreation = 2
	recreated, err := f.adapter.AddLine(f.ctx, f.ref, draft.ExternalID, in, in.Lines[0])
	require.NoError(t, err)
	require.NotEqual(t, item, recreated)
	require.Equal(t, in.KaitenInvoiceID.String()+":line:1:r2", f.fake.CallsOf(stripefake.OpCreateItem)[1].IdempotencyKey)

	require.NoError(t, f.adapter.DeleteDiscount(f.ctx, f.ref, "kt_missing_1_1"))
}

// The tax behaviour is frozen on the draft: a settings change between two
// attempts never mixes behaviours on one invoice.
func TestTaxBehaviourIsFrozenAtTheDraft(t *testing.T) {
	f := newFixture(t, stripe.Settings{TaxBehavior: stripe.TaxExclusive})
	_, customerID := f.customer(t)
	in := invoiceFor(customerID, "EUR", line(1, 100))
	draft, err := f.adapter.CreateDraft(f.ctx, f.ref, in)
	require.NoError(t, err)

	f.ref.Settings.(*stripe.Settings).TaxBehavior = stripe.TaxInclusive
	_, err = f.adapter.AddLine(f.ctx, f.ref, draft.ExternalID, in, in.Lines[0])
	require.NoError(t, err)
	require.Equal(t, "exclusive", f.fake.CallsOf(stripefake.OpCreateItem)[0].Form.Get("tax_behavior"))
}

func TestFinalizeAppliesAFinalizationThatAlreadyHappened(t *testing.T) {
	f := newFixture(t, stripe.Settings{})
	_, customerID := f.customer(t)
	in := invoiceFor(customerID, "EUR", line(1, 100))
	draft, err := f.adapter.CreateDraft(f.ctx, f.ref, in)
	require.NoError(t, err)
	f.fake.FinalizeInStripe(stripefake.DefaultAccount, draft.ExternalID)

	got, err := f.adapter.Finalize(f.ctx, f.ref, draft.ExternalID, in)
	require.NoError(t, err)
	require.Equal(t, provider.StatusOpen, got.Status)
	require.Equal(t, 0, f.fake.Count(stripefake.OpFinalizeInvoice), "read first, never finalized twice")
}

func TestSendAfterFinalizeWhenConfigured(t *testing.T) {
	f := newFixture(t, stripe.Settings{})
	f.adapter = stripe.New(stripe.Options{BaseURL: f.fake.URL(), HTTPClient: f.fake.Client(), SendAfterFinalize: true})
	_, customerID := f.customer(t)
	in := invoiceFor(customerID, "EUR", line(1, 100))
	draft, err := f.adapter.CreateDraft(f.ctx, f.ref, in)
	require.NoError(t, err)
	_, err = f.adapter.Finalize(f.ctx, f.ref, draft.ExternalID, in)
	require.NoError(t, err)
	sends := f.fake.CallsOf(stripefake.OpSendInvoice)
	require.Len(t, sends, 1)
	require.Equal(t, in.KaitenInvoiceID.String()+":send", sends[0].IdempotencyKey)
}

func TestVoid(t *testing.T) {
	f := newFixture(t, stripe.Settings{})
	_, customerID := f.customer(t)
	in := invoiceFor(customerID, "EUR", line(1, 100))
	open, err := f.adapter.CreateDraft(f.ctx, f.ref, in)
	require.NoError(t, err)
	_, err = f.adapter.Finalize(f.ctx, f.ref, open.ExternalID, in)
	require.NoError(t, err)

	require.NoError(t, f.adapter.VoidInvoice(f.ctx, f.ref, open.ExternalID))
	require.Equal(t, in.KaitenInvoiceID.String()+":void", f.fake.CallsOf(stripefake.OpVoidInvoice)[0].IdempotencyKey)
	require.NoError(t, f.adapter.VoidInvoice(f.ctx, f.ref, open.ExternalID), "already void is a success")
	require.NoError(t, f.adapter.VoidInvoice(f.ctx, f.ref, "in_missing"), "unknown is a success")

	paid := invoiceFor(customerID, "EUR", line(1, 100))
	draft, err := f.adapter.CreateDraft(f.ctx, f.ref, paid)
	require.NoError(t, err)
	_, err = f.adapter.Finalize(f.ctx, f.ref, draft.ExternalID, paid)
	require.NoError(t, err)
	f.fake.Pay(stripefake.DefaultAccount, draft.ExternalID)
	require.Equal(t, provider.ClassRejected, provider.ClassOf(f.adapter.VoidInvoice(f.ctx, f.ref, draft.ExternalID)))
}

func TestEventsOldestFirstFromTheCursor(t *testing.T) {
	f := newFixture(t, stripe.Settings{})
	_, customerID := f.customer(t)
	in := invoiceFor(customerID, "EUR", line(1, 100))
	draft, err := f.adapter.CreateDraft(f.ctx, f.ref, in)
	require.NoError(t, err)
	_, err = f.adapter.Finalize(f.ctx, f.ref, draft.ExternalID, in)
	require.NoError(t, err)
	f.fake.Pay(stripefake.DefaultAccount, draft.ExternalID)

	events, next, err := f.adapter.ListInvoiceEvents(f.ctx, f.ref, "", time.Now().Add(-time.Hour))
	require.NoError(t, err)
	require.Len(t, events, 2)
	require.Equal(t, "invoice.finalized", events[0].Type)
	require.Equal(t, "invoice.paid", events[1].Type)
	require.Equal(t, draft.ExternalID, events[1].ExternalInvoiceID)
	require.Equal(t, events[1].ID, next)
	call := f.fake.CallsOf(stripefake.OpListEvents)[0]
	require.Contains(t, call.Form["types[0]"], "invoice.finalized")
	require.NotEmpty(t, call.Form.Get("created[gte]"))

	again, _, err := f.adapter.ListInvoiceEvents(f.ctx, f.ref, next, time.Now().Add(-time.Hour))
	require.NoError(t, err)
	require.Empty(t, again, "the overlap read returns nothing at or before the cursor")
}

func TestErrorMappingAndScrubbing(t *testing.T) {
	cases := []struct {
		status          int
		errType, code   string
		want            provider.Class
		wantCode, about string
	}{
		{http.StatusUnauthorized, "invalid_request_error", "api_key_expired", provider.ClassNotConnected, "credentials_rejected", "customer"},
		{http.StatusForbidden, "invalid_request_error", "", provider.ClassNotConnected, "permission_missing", "customer"},
		{http.StatusInternalServerError, "api_error", "", provider.ClassUnavailable, "", "customer"},
		{http.StatusTooManyRequests, "invalid_request_error", "rate_limit", provider.ClassUnavailable, "rate_limit", "customer"},
		{http.StatusBadRequest, "invalid_request_error", "email_invalid", provider.ClassRejected, "email_invalid", "customer"},
		{http.StatusNotFound, "invalid_request_error", "resource_missing", provider.ClassCustomerMissing, "resource_missing", "customer"},
		{http.StatusNotFound, "invalid_request_error", "resource_missing", provider.ClassNotFound, "resource_missing", "invoice"},
		{http.StatusConflict, "idempotency_error", "idempotency_key_in_use", provider.ClassUnavailable, "idempotency_key_in_use", "customer"},
	}
	for _, tc := range cases {
		t.Run(fmt.Sprintf("%d %s %s", tc.status, tc.code, tc.about), func(t *testing.T) {
			f := newFixture(t, stripe.Settings{})
			c, customerID := f.customer(t)
			var err error
			if tc.about == "customer" {
				f.fake.Fail(stripefake.OpRetrieveCustomer, tc.status, tc.errType, tc.code, 1)
				_, err = f.adapter.EnsureCustomer(f.ctx, f.ref, c)
			} else {
				f.fake.Fail(stripefake.OpRetrieveInvoice, tc.status, tc.errType, tc.code, 1)
				_, err = f.adapter.GetInvoice(f.ctx, f.ref, "in_1")
			}
			_ = customerID
			require.Equal(t, tc.want, provider.ClassOf(err), "%v", err)
			var providerErr *provider.Error
			require.ErrorAs(t, err, &providerErr)
			require.Equal(t, tc.wantCode, providerErr.Code)
			require.NotEmpty(t, providerErr.RequestID)
		})
	}

	t.Run("parameters changed under one key", func(t *testing.T) {
		f := newFixture(t, stripe.Settings{})
		_, customerID := f.customer(t)
		in := invoiceFor(customerID, "EUR", line(1, 100))
		_, err := f.adapter.CreateDraft(f.ctx, f.ref, in)
		require.NoError(t, err)
		days := int32(14)
		in.DaysUntilDue = &days
		_, err = f.adapter.CreateDraft(f.ctx, f.ref, in)
		require.Equal(t, provider.ClassParametersChanged, provider.ClassOf(err))
	})

	t.Run("network", func(t *testing.T) {
		f := newFixture(t, stripe.Settings{})
		c, _ := f.customer(t)
		f.fake.Partition(true)
		_, err := f.adapter.EnsureCustomer(f.ctx, f.ref, c)
		require.Equal(t, provider.ClassUnavailable, provider.ClassOf(err))
	})

	t.Run("a key Stripe echoes is scrubbed", func(t *testing.T) {
		f := newFixture(t, stripe.Settings{SecretKey: "rk_test_Bad1"})
		f.fake.RejectKey("rk_test_Bad1", http.StatusUnauthorized, "invalid_request_error", "api_key_expired",
			"Expired API Key provided: rk_test_Bad1")
		_, err := f.adapter.CheckCredentials(f.ctx, f.ref.Settings)
		require.Equal(t, provider.ClassNotConnected, provider.ClassOf(err))
		require.NotContains(t, err.Error(), "rk_test_Bad1")
	})
}

func TestCredentialsAndAccount(t *testing.T) {
	f := newFixture(t, stripe.Settings{})
	account, err := f.adapter.CheckCredentials(f.ctx, f.ref.Settings)
	require.NoError(t, err)
	require.False(t, account.Livemode)
	require.Equal(t, 1, f.fake.Count(stripefake.OpListCustomers))
	require.Equal(t, "1", f.fake.CallsOf(stripefake.OpListCustomers)[0].Form.Get("limit"))

	live, err := f.adapter.CheckCredentials(f.ctx, &stripe.Settings{SecretKey: "rk_live_X1", TaxBehavior: stripe.TaxExclusive})
	require.NoError(t, err)
	require.True(t, live.Livemode)

	_, customerID := f.customer(t)
	same, err := f.adapter.SameAccount(f.ctx, &stripe.Settings{SecretKey: "rk_test_A2"}, customerID)
	require.NoError(t, err)
	require.True(t, same)

	f.fake.SetAccount("rk_test_Other1", "acct_other")
	other, err := f.adapter.SameAccount(f.ctx, &stripe.Settings{SecretKey: "rk_test_Other1"}, customerID)
	require.NoError(t, err)
	require.False(t, other)

	f.fake.DeleteObject(stripefake.DefaultAccount, customerID)
	deleted, err := f.adapter.SameAccount(f.ctx, &stripe.Settings{SecretKey: "rk_test_A2"}, customerID)
	require.NoError(t, err)
	require.True(t, deleted, "a deleted customer still proves the account")
}

func TestSettings(t *testing.T) {
	parsed, err := stripe.Parse(map[string]any{"stripeSecretKey": "rk_live_A1"})
	require.NoError(t, err)
	settings := parsed.Settings.(*stripe.Settings)
	require.Equal(t, stripe.Settings{SecretKey: "rk_live_A1", AutomaticTax: false, TaxBehavior: stripe.TaxExclusive, AutoFinalize: true}, *settings)
	require.True(t, parsed.Livemode)
	require.True(t, parsed.AutoFinalize)
	require.False(t, parsed.InclusiveTax)

	parsed, err = stripe.Parse(map[string]any{"stripeSecretKey": "rk_test_A1", "taxBehavior": "INCLUSIVE", "autoFinalize": false, "automaticTax": true})
	require.NoError(t, err)
	require.True(t, parsed.InclusiveTax)
	require.False(t, parsed.AutoFinalize)

	for _, bad := range []map[string]any{{}, {"stripeSecretKey": "rk_test_A1", "taxBehavior": "x"}, {"stripeSecretKey": "rk_test_A1", "automaticTax": "yes"}} {
		_, err := stripe.Parse(bad)
		require.Error(t, err)
	}

	var logs strings.Builder
	slog.New(slog.NewJSONHandler(&logs, nil)).Info("settings", "settings", *settings)
	printed := fmt.Sprintf("%v %+v %#v %s", *settings, *settings, *settings, logs.String())
	require.NotContains(t, printed, "rk_live_A1")
}

func TestSettingsKeysMatchTheManifest(t *testing.T) {
	properties := connectorstripe.Manifest().SettingsSchema["properties"].(map[string]any)
	_, err := stripe.Parse(map[string]any{
		connectorstripe.SettingSecretKey: "rk_test_A1", connectorstripe.SettingAutomaticTax: true,
		connectorstripe.SettingTaxBehavior: "INCLUSIVE", connectorstripe.SettingAutoFinalize: false,
	})
	require.NoError(t, err)
	require.Len(t, properties, 4)
}

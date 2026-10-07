package stripe_test

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
)

// openAutomatic pushes a CHARGE_AUTOMATICALLY invoice to open.
func openAutomatic(t *testing.T, f fixture, customerID string) (provider.NormalizedInvoice, string) {
	t.Helper()
	in := invoiceFor(customerID, "EUR", line(1, 9900))
	in.CollectionMethod = "CHARGE_AUTOMATICALLY"
	draft, err := f.adapter.CreateDraft(f.ctx, f.ref, in)
	require.NoError(t, err)
	create := f.fake.CallsOf(stripefake.OpCreateInvoice)
	require.Equal(t, "charge_automatically", create[len(create)-1].Form.Get("collection_method"))
	require.Empty(t, create[len(create)-1].Form.Get("days_until_due"), "Stripe refuses terms on an invoice it charges")
	_, err = f.adapter.AddLine(f.ctx, f.ref, draft.ExternalID, in, in.Lines[0])
	require.NoError(t, err)
	_, err = f.adapter.Finalize(f.ctx, f.ref, draft.ExternalID, in)
	require.NoError(t, err)
	return in, draft.ExternalID
}

func TestPayOutcomes(t *testing.T) {
	cases := map[string]struct {
		card       string // "" = no default payment method
		noCard     bool
		wantStatus provider.PaymentStatus
		wantCode   string
		wantStripe string
	}{
		"paid":          {card: stripefake.CardSucceeds, wantStatus: provider.PaymentPaid, wantStripe: "paid"},
		"declined":      {card: stripefake.CardInsufficientFunds, wantStatus: provider.PaymentFailed, wantCode: "insufficient_funds", wantStripe: "open"},
		"expired":       {card: stripefake.CardExpired, wantStatus: provider.PaymentFailed, wantCode: provider.PaymentCodeExpiredCard, wantStripe: "open"},
		"3-D Secure":    {card: stripefake.CardAuthenticationRequire, wantStatus: provider.PaymentRequiresAction, wantCode: provider.PaymentCodeAuthenticationRequired, wantStripe: "open"},
		"nothing saved": {noCard: true, wantStatus: provider.PaymentFailed, wantCode: provider.PaymentCodeNoPaymentMethod, wantStripe: "open"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			f := newFixture(t, stripe.Settings{})
			_, customerID := f.customer(t)
			if !tc.noCard {
				f.fake.AttachCard(stripefake.DefaultAccount, customerID, "visa", "4242", 12, 2030, tc.card)
			}
			in, id := openAutomatic(t, f, customerID)

			outcome, err := f.adapter.Pay(f.ctx, f.ref, id, in)
			require.NoError(t, err)
			require.Equal(t, tc.wantStatus, outcome.Status)
			require.Equal(t, tc.wantCode, outcome.Code)
			require.Equal(t, provider.Status(tc.wantStripe), outcome.Invoice.Status)
			if tc.noCard {
				require.Equal(t, 0, f.fake.Count(stripefake.OpPayInvoice), "nothing to charge, no charge")
				return
			}
			pay := f.fake.CallsOf(stripefake.OpPayInvoice)
			require.Len(t, pay, 1)
			require.Equal(t, in.KaitenInvoiceID.String()+":pay", pay[0].IdempotencyKey)
			require.Equal(t, "true", pay[0].Form.Get("off_session"))

			// The same charge again: Stripe replays the outcome under the key,
			// or the invoice is already paid. Never a second charge.
			again, err := f.adapter.Pay(f.ctx, f.ref, id, in)
			require.NoError(t, err)
			require.Equal(t, tc.wantStatus, again.Status)
		})
	}
}

func TestPayUnknownOutcomeIsAnError(t *testing.T) {
	f := newFixture(t, stripe.Settings{})
	_, customerID := f.customer(t)
	f.fake.AttachCard(stripefake.DefaultAccount, customerID, "visa", "4242", 12, 2030, stripefake.CardSucceeds)
	in, id := openAutomatic(t, f, customerID)

	f.fake.DropResponse(stripefake.OpPayInvoice)
	_, err := f.adapter.Pay(f.ctx, f.ref, id, in)
	require.Equal(t, provider.ClassUnavailable, provider.ClassOf(err), "a lost answer is an unknown outcome")

	outcome, err := f.adapter.Pay(f.ctx, f.ref, id, in)
	require.NoError(t, err)
	require.Equal(t, provider.PaymentPaid, outcome.Status)
	require.Equal(t, 1, outcome.Invoice.AttemptCount, "the retry was answered from the first charge: charged once")
}

func TestSetupSessionAndDefaultPaymentMethod(t *testing.T) {
	f := newFixture(t, stripe.Settings{})
	c, customerID := f.customer(t)

	link, err := f.adapter.CreateSetupSession(f.ctx, f.ref, provider.SetupSession{
		ExternalCustomerID: customerID, Currency: "EUR", ReturnURL: "https://app.acme.test/billing?tab=card",
		Metadata: map[string]string{"kaiten_customer_id": c.CustomerID.String()},
	})
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(link.URL, "https://checkout.stripe.test/c/"))
	require.True(t, link.ExpiresAt.After(time.Now()))
	create := f.fake.CallsOf(stripefake.OpCreateCheckoutSession)[0]
	require.Equal(t, "setup", create.Form.Get("mode"))
	require.Equal(t, "eur", create.Form.Get("currency"))
	require.Equal(t, "https://app.acme.test/billing?tab=card&kaiten_setup_session={CHECKOUT_SESSION_ID}", create.Form.Get("success_url"))
	require.Equal(t, "required", create.Form.Get("billing_address_collection"))
	require.Equal(t, c.CustomerID.String(), create.Form.Get("metadata[kaiten_customer_id]"))

	open, err := f.adapter.GetSetupSession(f.ctx, f.ref, link.SessionID)
	require.NoError(t, err)
	require.False(t, open.Complete)

	pmID := f.fake.CompleteSetupSession(stripefake.DefaultAccount, link.SessionID, "visa", "4242", 12, 2030)
	done, err := f.adapter.GetSetupSession(f.ctx, f.ref, link.SessionID)
	require.NoError(t, err)
	require.True(t, done.Complete)
	require.Equal(t, pmID, done.ExternalPaymentMethodID)
	require.Equal(t, customerID, done.ExternalCustomerID)
	require.Equal(t, c.CustomerID.String(), done.Metadata["kaiten_customer_id"])

	none, err := f.adapter.DefaultPaymentMethod(f.ctx, f.ref, customerID)
	require.NoError(t, err)
	require.Nil(t, none, "setup mode does not set a default")

	set, err := f.adapter.SetDefaultPaymentMethod(f.ctx, f.ref, customerID, pmID)
	require.NoError(t, err)
	require.Equal(t, provider.PaymentMethod{ExternalID: pmID, Brand: "visa", Last4: "4242", ExpMonth: 12, ExpYear: 2030}, set)
	got, err := f.adapter.DefaultPaymentMethod(f.ctx, f.ref, customerID)
	require.NoError(t, err)
	require.Equal(t, set, *got)

	url, err := f.adapter.CreateBillingPortalSession(f.ctx, f.ref, customerID, "https://app.acme.test/billing")
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(url, "https://billing.stripe.test/p/"))

	require.NoError(t, f.adapter.DetachPaymentMethod(f.ctx, f.ref, pmID))
	require.NoError(t, f.adapter.DetachPaymentMethod(f.ctx, f.ref, pmID), "already detached is a success")
	gone, err := f.adapter.DefaultPaymentMethod(f.ctx, f.ref, customerID)
	require.NoError(t, err)
	require.Nil(t, gone)

	// The feed reports the customer's changes.
	events, _, err := f.adapter.ListInvoiceEvents(f.ctx, f.ref, "", time.Now().Add(-time.Hour))
	require.NoError(t, err)
	var kinds []string
	for _, e := range events {
		kinds = append(kinds, e.Type)
		require.Equal(t, customerID, e.ExternalCustomerID, "%s names the customer", e.Type)
	}
	require.Equal(t, []string{"checkout.session.completed", "customer.updated", "payment_method.detached"}, kinds)
	require.Equal(t, link.SessionID, events[0].ExternalSessionID)
}

func TestCapabilitiesIncludeAutomaticCollection(t *testing.T) {
	capabilities := stripe.New(stripe.Options{}).Capabilities()
	require.True(t, capabilities.ChargeAutomatically)
	require.True(t, capabilities.PaymentMethodCapture)
	require.True(t, capabilities.BillingPortal)
}

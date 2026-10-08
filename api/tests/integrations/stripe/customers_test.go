package stripe_test

import (
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// anotherInstance is a second instance of the same customer and version.
func anotherInstance(t *testing.T, s sold, name string) sold {
	t.Helper()
	s.instance = commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "POST", "/api/instances", map[string]any{
		"name": name, "description": "d", "customerId": s.customer.ID, "licenseId": s.version.ID,
		"startLicenseDate": time.Now().UTC().Add(-24 * time.Hour), "endLicenseDate": time.Now().UTC().AddDate(1, 0, 0),
		"metadata": map[string]any{},
	}), fiber.StatusCreated)
	return s
}

// §12.1 rule 6: a customer deleted in Stripe is created again, under a key of
// its own, when no open invoice references it; otherwise billing refuses with
// .ProviderCustomerMissing rather than split one customer's invoices across
// two Stripe customers.
func TestCustomerDeletedInStripe(t *testing.T) {
	t.Run("NothingReferencesIt_ItIsCreatedAgain", func(t *testing.T) {
		fresh(t)
		connect(t, nil)
		s := newSold(t, "acme")
		first := subscribe(t, s)
		pushed := waitFor(t, first.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PUSHED" }, "pushed")
		fake.Pay(stripefake.DefaultAccount, deref(pushed.Provider.ExternalInvoiceID))
		require.Equal(t, fiber.StatusAccepted, call(t, "POST", "/api/billing/sync", nil).StatusCode)
		require.Equal(t, "PAID", invoice(t, first.ActivationInvoice.ID).Status)

		old := deref(pushed.Provider.ExternalCustomerID)
		fake.DeleteObject(stripefake.DefaultAccount, old)

		second := subscribe(t, anotherInstance(t, s, "acme staging"))
		repushed := waitFor(t, second.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PUSHED" }, "pushed to the new customer")
		renewed := deref(repushed.Provider.ExternalCustomerID)
		require.NotEqual(t, old, renewed)
		require.Equal(t, 2, fake.Customers(stripefake.DefaultAccount))
		creates := fake.CallsOf(stripefake.OpCreateCustomer)
		require.True(t, strings.HasSuffix(creates[len(creates)-1].IdempotencyKey, ":recreate:"+old))
	})

	t.Run("AnOpenInvoiceReferencesIt_TheSubscribeIsRefused", func(t *testing.T) {
		fresh(t)
		connect(t, nil)
		s := newSold(t, "acme")
		first := subscribe(t, s)
		pushed := waitFor(t, first.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PUSHED" }, "pushed, open")
		fake.DeleteObject(stripefake.DefaultAccount, deref(pushed.Provider.ExternalCustomerID))

		staging := anotherInstance(t, s, "acme staging")
		got := problem(t, fiber.StatusConflict, "POST", "/api/instances/"+staging.instance.Slug+"/billing",
			map[string]any{"basePriceId": s.monthly.ID, "providerKind": "STRIPE"})
		require.Equal(t, "SubscribeInstance.ProviderCustomerMissing", got.Code)
		require.Equal(t, 1, fake.Customers(stripefake.DefaultAccount), "no second customer")
	})
}

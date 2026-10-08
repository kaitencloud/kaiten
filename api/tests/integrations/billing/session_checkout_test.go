package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessioncheckout"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

const checkoutPath = "/api/public/session/checkout"

// TestSessionCheckoutFreePlan: a free plan is checked out with no payment
// provider and no card, and the instance is moved to its version.
func TestSessionCheckoutFreePlan(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	community := newDefaultVersion(t, "Community", "FREE")
	makePublic(t, community.FamilySlug)
	free := createPrice(t, community.Slug, defaultFlatFee("0", "MONTHLY"))
	newPublishableKey(t, storefront)

	// The instance starts on a private version; the checkout moves it.
	private := newVersion(t, "Internal", "PUBLISHED")
	customer := newCustomer(t, "acme")
	instance := newInstance(t, "Acme prod", customer.ID, private.ID)
	session := mintSession(t, testServer, customer.Slug, instance.Slug)
	order := map[string]any{"licensePriceId": free.ID, "returnUrl": storefront + "/billing"}

	preview := commonfixture.AssertJSONResponse[createsessioncheckout.SessionCheckout](t,
		sessionCall(t, testServer, "POST", checkoutPath, session.Token, storefront, with(order, "dryRun", true)), fiber.StatusOK)
	require.Equal(t, createsessioncheckout.StatusPreview, preview.Status)
	require.EqualValues(t, 0, preview.DueToday.Total)
	moved := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "GET", "/api/instances/"+instance.Slug, nil), fiber.StatusOK)
	require.Equal(t, private.ID, moved.LicenseID, "a dry run changes nothing")

	done := commonfixture.AssertJSONResponse[createsessioncheckout.SessionCheckout](t,
		sessionCall(t, testServer, "POST", checkoutPath, session.Token, storefront, order), fiber.StatusCreated)
	require.Equal(t, createsessioncheckout.StatusSubscribed, done.Status)
	require.Equal(t, "ACTIVE", done.Subscription.Status)
	require.Equal(t, "NOOP", done.Subscription.ProviderKind)
	require.Equal(t, createsessioncheckout.PaymentNotRequired, done.Payment.Status)

	moved = commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "GET", "/api/instances/"+instance.Slug, nil), fiber.StatusOK)
	require.Equal(t, community.ID, moved.LicenseID, "the checkout moved the instance to the plan's version")
	billing := commonfixture.AssertJSONResponse[subscriptions.InstanceBilling](t,
		call(t, "GET", "/api/instances/"+instance.Slug+"/billing", nil), fiber.StatusOK)
	require.Equal(t, free.ID, billing.BasePrice.ID)

	require.Equal(t, "CreateSessionCheckout.AlreadySubscribed",
		sessionProblem(t, sessionCall(t, testServer, "POST", checkoutPath, session.Token, storefront, order), fiber.StatusConflict))
}

// TestSessionCheckoutRefusals: what the public contract refuses, before
// anything is written.
func TestSessionCheckoutRefusals(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	pro := newDefaultVersion(t, "Pro", "PAID")
	makePublic(t, pro.FamilySlug)
	monthly := createPrice(t, pro.Slug, defaultFlatFee("2900", "MONTHLY"))
	community := newDefaultVersion(t, "Community", "FREE")
	makePublic(t, community.FamilySlug)
	free := createPrice(t, community.Slug, defaultFlatFee("0", "MONTHLY"))
	secret := newDefaultVersion(t, "Secret", "PAID")
	hidden := createPrice(t, secret.Slug, defaultFlatFee("100", "MONTHLY"))
	newPublishableKey(t, storefront)

	customer := newCustomer(t, "acme")
	instance := newInstance(t, "Acme prod", customer.ID, pro.ID)
	bound := mintSession(t, testServer, customer.Slug, instance.Slug)
	checkout := func(token string, order map[string]any) *kaitenerrors.Problem {
		t.Helper()
		resp := sessionCall(t, testServer, "POST", checkoutPath, token, storefront, order)
		require.GreaterOrEqual(t, resp.StatusCode, 400)
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, resp.StatusCode)
		return &problem
	}

	unbound := mintSession(t, testServer, customer.Slug, "")
	require.Equal(t, "CreateSessionCheckout.InstanceRequired", checkout(unbound.Token, map[string]any{"licensePriceId": free.ID}).Code)
	require.Equal(t, "CreateSessionCheckout.PriceNotPublic", checkout(bound.Token, map[string]any{"licensePriceId": hidden.ID}).Code)
	require.Equal(t, "CreateSessionCheckout.ProviderCannotCapturePayment",
		checkout(bound.Token, map[string]any{"licensePriceId": monthly.ID}).Code, "no provider that takes cards is connected")
	require.Equal(t, "CreateSessionCheckout.InvalidReturnUrl",
		checkout(bound.Token, map[string]any{"licensePriceId": free.ID, "returnUrl": "https://evil.example/back"}).Code)
	require.Equal(t, "CreateSessionCheckout.AddonNotPublic",
		checkout(bound.Token, map[string]any{"licensePriceId": free.ID, "addOns": []map[string]any{{"addonSlug": "nope", "quantity": 1}}}).Code)
	require.Equal(t, "CreateSessionCheckout.InvalidBillingEmail",
		checkout(bound.Token, map[string]any{"licensePriceId": free.ID, "billingEmail": "not-an-address"}).Code)

	// A customer without a billing e-mail must give one.
	walkIn := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/customers", map[string]any{"name": "walk-in"}), fiber.StatusCreated)
	walkInInstance := newInstance(t, "Walk-in prod", parseID(t, walkIn["id"]), community.ID)
	walkInSession := mintSession(t, testServer, walkIn["slug"].(string), walkInInstance.Slug)
	require.Equal(t, "CreateSessionCheckout.BillingEmailRequired", checkout(walkInSession.Token, map[string]any{"licensePriceId": free.ID}).Code)
	done := commonfixture.AssertJSONResponse[createsessioncheckout.SessionCheckout](t, sessionCall(t, testServer, "POST", checkoutPath,
		walkInSession.Token, storefront, map[string]any{"licensePriceId": free.ID, "billingEmail": "ap@walk-in.test"}), fiber.StatusCreated)
	require.Equal(t, createsessioncheckout.StatusSubscribed, done.Status)
	stored := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", "/api/customers/"+walkIn["slug"].(string), nil), fiber.StatusOK)
	require.Equal(t, "ap@walk-in.test", stored["billingEmail"], "the address given is stored on the customer")
}

// TestSubscribeWithAddonsAndVoucher: the vendor's subscribe attaches the
// add-ons and redeems the voucher it is started with, in its transaction, and
// the ACTIVATION invoice bills both.
func TestSubscribeWithAddonsAndVoucher(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "seats", 0)
	s := newSold(t, flatFee("2900", "MONTHLY"))
	addon := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats"})
	addonGrant(t, addon.Slug, "seats", 5, "ADD")
	fits(t, addon.Slug, s.version.Slug)
	seatPrice := flatFee("900", "MONTHLY")
	seatPrice["isDefault"] = true
	addonPrice(t, addon.Slug, seatPrice)
	half := newVoucher(t, percentOff("50", nil))
	publish(t, half)
	path := "/api/instances/" + s.instance.Slug + "/billing"

	refused := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, "POST", path, map[string]any{
		"basePriceId": s.monthly.ID, "addOns": []map[string]any{{"addonSlug": "nope", "quantity": 1}},
	}), fiber.StatusUnprocessableEntity)
	require.Equal(t, "SubscribeInstance.AddonInvalid", refused.Code)
	require.Len(t, refused.Errors, 1)
	require.Equal(t, "body.addOns[0]", refused.Errors[0].Location)
	require.Equal(t, "AttachInstanceAddon.AddonNotFound", refused.Errors[0].Value.(map[string]any)["code"])

	refused = commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, call(t, "POST", path, map[string]any{
		"basePriceId": s.monthly.ID, "voucherCode": "NOPE",
	}), fiber.StatusUnprocessableEntity)
	require.Equal(t, "SubscribeInstance.VoucherInvalid", refused.Code)
	require.Equal(t, fiber.StatusNotFound, call(t, "GET", path, nil).StatusCode, "a refused subscribe writes nothing")

	started := subscribe(t, s.instance.Slug, map[string]any{
		"basePriceId": s.monthly.ID, "addOns": []map[string]any{{"addonSlug": addon.Slug, "quantity": 2}}, "voucherCode": half.Code,
	})
	activation := getInvoice(t, started.ActivationInvoice.ID)
	types := make([]rating.LineType, 0, len(activation.Lines))
	for _, line := range activation.Lines {
		types = append(types, line.Type)
	}
	require.Equal(t, []rating.LineType{rating.LineBase, rating.LineAddon, rating.LineDiscount}, types)
	require.EqualValues(t, 2900+2*900, activation.Subtotal)
	require.EqualValues(t, 1450, activation.DiscountTotal, "half the licence base")
	require.EqualValues(t, 2900+1800-1450, activation.Total)
}

func with(order map[string]any, key string, value any) map[string]any {
	out := make(map[string]any, len(order)+1)
	for k, v := range order {
		out[k] = v
	}
	out[key] = value
	return out
}

func parseID(t *testing.T, raw any) uuid.UUID {
	t.Helper()
	id, err := uuid.Parse(raw.(string))
	require.NoError(t, err)
	return id
}

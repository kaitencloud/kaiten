package billing_test

import (
	"encoding/json"
	"testing"
	"time"

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

// TestSessionCheckoutReplacesAFreePlan: a checkout accepts an instance whose
// live subscription is free -- a FREE family, no add-on price above 0 -- and
// in its transaction cancels it at once, with no invoice, then subscribes the
// same row (§9.10 rule 6, V31-68). Any other live subscription is refused.
func TestSessionCheckoutReplacesAFreePlan(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	community := newDefaultVersion(t, "Community", "FREE")
	makePublic(t, community.FamilySlug)
	communityFree := createPrice(t, community.Slug, defaultFlatFee("0", "MONTHLY"))
	hobby := newDefaultVersion(t, "Hobby", "FREE")
	makePublic(t, hobby.FamilySlug)
	hobbyFree := createPrice(t, hobby.Slug, defaultFlatFee("0", "MONTHLY"))
	pro := newDefaultVersion(t, "Pro", "PAID")
	makePublic(t, pro.FamilySlug)
	proMonthly := createPrice(t, pro.Slug, defaultFlatFee("2900", "MONTHLY"))
	newPublishableKey(t, storefront)
	customer := newCustomer(t, "acme")

	instance := newInstance(t, "Acme prod", customer.ID, community.ID)
	// Subscribed an hour ago: its ACTIVATION and the checkout's start at
	// different instants.
	before := subscribe(t, instance.Slug, map[string]any{"basePriceId": communityFree.ID, "startAt": time.Now().UTC().Add(-time.Hour)})
	session := mintSession(t, testServer, customer.Slug, instance.Slug)
	require.True(t, portalOf(t, session.Token).Capabilities.Checkout, "a free live subscription can be replaced")

	require.Equal(t, "CreateSessionCheckout.AlreadySubscribed", sessionProblem(t, sessionCall(t, testServer, "POST", checkoutPath,
		session.Token, storefront, map[string]any{"licensePriceId": communityFree.ID}), fiber.StatusConflict),
		"a checkout replaces a free subscription with another price, not with the same one")

	order := map[string]any{"licensePriceId": hobbyFree.ID}
	preview := commonfixture.AssertJSONResponse[createsessioncheckout.SessionCheckout](t,
		sessionCall(t, testServer, "POST", checkoutPath, session.Token, storefront, with(order, "dryRun", true)), fiber.StatusOK)
	require.Equal(t, createsessioncheckout.StatusPreview, preview.Status)
	still := commonfixture.AssertJSONResponse[subscriptions.InstanceBilling](t,
		call(t, "GET", "/api/instances/"+instance.Slug+"/billing", nil), fiber.StatusOK)
	require.Equal(t, "ACTIVE", still.Status, "a dry run cancels nothing")
	require.Equal(t, communityFree.ID, still.BasePrice.ID)
	require.Empty(t, outboxPayloads(t, "INSTANCE_BILLING_CANCELED"))

	done := commonfixture.AssertJSONResponse[createsessioncheckout.SessionCheckout](t,
		sessionCall(t, testServer, "POST", checkoutPath, session.Token, storefront, order), fiber.StatusCreated)
	require.Equal(t, createsessioncheckout.StatusSubscribed, done.Status)
	require.Equal(t, "ACTIVE", done.Subscription.Status)
	after := commonfixture.AssertJSONResponse[subscriptions.InstanceBilling](t,
		call(t, "GET", "/api/instances/"+instance.Slug+"/billing", nil), fiber.StatusOK)
	require.Equal(t, before.ID, after.ID, "the same row, subscribed again")
	require.Equal(t, hobbyFree.ID, after.BasePrice.ID)
	moved := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "GET", "/api/instances/"+instance.Slug, nil), fiber.StatusOK)
	require.Equal(t, hobby.ID, moved.LicenseID)

	var finals int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT count(*) FROM instance_invoice WHERE kind = 'FINAL'`).Scan(&finals))
	require.Zero(t, finals, "the free subscription is canceled with no invoice")
	canceled := outboxPayloads(t, "INSTANCE_BILLING_CANCELED")
	require.Len(t, canceled, 1)
	require.Equal(t, "IMMEDIATE", canceled[0]["mode"])
	require.Nil(t, canceled[0]["finalInvoiceId"])
	require.Equal(t, "CANCELED", canceled[0]["status"])
	// Both in the checkout's transaction, the cancellation written first.
	var canceledAt, resubscribedAt []time.Time
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		var payload map[string]any
		require.NoError(t, json.Unmarshal(event.Data, &payload))
		switch {
		case event.EventName == "INSTANCE_BILLING_CANCELED":
			canceledAt = append(canceledAt, event.OccurredAt.Time)
		case event.EventName == "INSTANCE_BILLING_STARTED" && payload["resubscribed"] == true:
			resubscribedAt = append(resubscribedAt, event.OccurredAt.Time)
		}
	}
	require.Len(t, resubscribedAt, 1)
	require.Equal(t, canceledAt, resubscribedAt, "one transaction")

	// Not free: a PAID family...
	paid := newInstance(t, "Acme paid", customer.ID, pro.ID)
	subscribe(t, paid.Slug, map[string]any{"basePriceId": proMonthly.ID})
	paidSession := mintSession(t, testServer, customer.Slug, paid.Slug)
	require.False(t, portalOf(t, paidSession.Token).Capabilities.Checkout)
	require.Equal(t, "CreateSessionCheckout.AlreadySubscribed", sessionProblem(t, sessionCall(t, testServer, "POST", checkoutPath,
		paidSession.Token, storefront, map[string]any{"licensePriceId": communityFree.ID}), fiber.StatusConflict))

	// ...or a FREE family holding an add-on priced above 0.
	addon := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats"})
	fits(t, addon.Slug, community.FamilySlug)
	addonPrice(t, addon.Slug, defaultFlatFee("900", "MONTHLY"))
	withAddon := newInstance(t, "Acme add-on", customer.ID, community.ID)
	subscribe(t, withAddon.Slug, map[string]any{"basePriceId": communityFree.ID, "startAt": time.Now().UTC().Add(-time.Hour)})
	attach(t, withAddon.Slug, addon.Slug, 1)
	addonSession := mintSession(t, testServer, customer.Slug, withAddon.Slug)
	require.False(t, portalOf(t, addonSession.Token).Capabilities.Checkout)
	require.Equal(t, "CreateSessionCheckout.AlreadySubscribed", sessionProblem(t, sessionCall(t, testServer, "POST", checkoutPath,
		addonSession.Token, storefront, map[string]any{"licensePriceId": hobbyFree.ID}), fiber.StatusConflict))

	// The vendor's subscribe never replaces one.
	require.Equal(t, "SubscribeInstance.AlreadySubscribed", commonfixture.AssertJSONResponse[kaitenerrors.Problem](t,
		call(t, "POST", "/api/instances/"+instance.Slug+"/billing", map[string]any{"basePriceId": hobbyFree.ID}), fiber.StatusConflict).Code)
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
	// ...but not to see the amounts: a dry run computes them without one (V31-12).
	preview := commonfixture.AssertJSONResponse[createsessioncheckout.SessionCheckout](t, sessionCall(t, testServer, "POST", checkoutPath,
		walkInSession.Token, storefront, map[string]any{"licensePriceId": free.ID, "dryRun": true}), fiber.StatusOK)
	require.Equal(t, createsessioncheckout.StatusPreview, preview.Status)
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

// TestSessionCheckoutQuota: a checkout is refused a plan the instance's usage
// already exceeds (§14.4 rule 2), unless the add-ons it buys with it make room.
func TestSessionCheckoutQuota(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "seats", 0)
	starter := newDefaultVersion(t, "Starter", "FREE")
	makePublic(t, starter.FamilySlug)
	grant(t, starter.Slug, "seats", 10, 0)
	free := createPrice(t, starter.Slug, defaultFlatFee("0", "MONTHLY"))
	newPublishableKey(t, storefront)

	private := newVersion(t, "Internal", "PUBLISHED")
	grant(t, private.Slug, "seats", 100, 0)
	customer := newCustomer(t, "acme")
	instance := newInstance(t, "Acme prod", customer.ID, private.ID)
	resp := call(t, "POST", "/api/instances/"+instance.Slug+"/entitlements/seats/usage",
		map[string]any{"value": map[string]any{"type": "number", "value": 30}, "behavior": "append"})
	require.Less(t, resp.StatusCode, 300)
	session := mintSession(t, testServer, customer.Slug, instance.Slug)
	order := map[string]any{"licensePriceId": free.ID}

	for _, dryRun := range []bool{true, false} {
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t,
			sessionCall(t, testServer, "POST", checkoutPath, session.Token, storefront, with(order, "dryRun", dryRun)), fiber.StatusUnprocessableEntity)
		require.Equal(t, "CreateSessionCheckout.QuotaExceeded", problem.Code, "dry run %v", dryRun)
		require.Equal(t, map[string]any{"entitlementSlugs": []any{"seats"}}, problem.Errors[0].Value)
		require.Equal(t, "body.licensePriceId", problem.Errors[0].Location, "the checkout's own member, not the subscription's")
	}
	moved := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "GET", "/api/instances/"+instance.Slug, nil), fiber.StatusOK)
	require.Equal(t, private.ID, moved.LicenseID, "nothing was changed")

	// Seats bought with the plan make room for the usage.
	seats := newAddon(t, map[string]any{"name": "Extra seats", "slug": "extra-seats", "isDefault": true, "pricingType": "FREE"})
	addonGrant(t, seats.Slug, "seats", 25, "ADD")
	fits(t, seats.Slug, starter.FamilySlug)
	commonfixture.AssertJSONResponse[map[string]any](t,
		call(t, "PATCH", "/api/addon-families/extra-seats", map[string]any{"isPublic": true}), fiber.StatusOK)
	done := commonfixture.AssertJSONResponse[createsessioncheckout.SessionCheckout](t, sessionCall(t, testServer, "POST", checkoutPath,
		session.Token, storefront, with(order, "addOns", []map[string]any{{"addonSlug": seats.Slug, "quantity": 1}})), fiber.StatusCreated)
	require.Equal(t, createsessioncheckout.StatusSubscribed, done.Status)
}

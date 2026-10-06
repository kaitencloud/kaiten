package billing_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// sold is a published licence version priced at 29.00 EUR a month in
// advance, and an instance of it.
type sold struct {
	version  licenseschema.License
	monthly  prices.Price
	instance instanceschema.Instance
}

func newSold(t *testing.T, base map[string]any) sold {
	t.Helper()
	version := newVersion(t, "Pro", licenseschema.Published)
	monthly := createPrice(t, version.Slug, base)
	customer := newCustomer(t, "acme")
	return sold{version: version, monthly: monthly, instance: newInstance(t, "Acme prod", customer.ID, version.ID)}
}

func subscribe(t *testing.T, instanceSlug string, body map[string]any) subscribeinstance.StartedSubscription {
	t.Helper()
	return commonfixture.AssertJSONResponse[subscribeinstance.StartedSubscription](t,
		call(t, "POST", "/api/instances/"+instanceSlug+"/billing", body), fiber.StatusCreated)
}

func outboxPayloads(t *testing.T, eventName string) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if event.EventName == eventName {
			var payload map[string]any
			require.NoError(t, json.Unmarshal(event.Data, &payload))
			out = append(out, payload)
		}
	}
	return out
}

func TestSubscribeInstance(t *testing.T) {
	t.Run("AnAdvanceBase_IssuesTheFirstPeriod_ForTheOrganizationToCollect", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))

		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.Equal(t, subscriptions.StatusActive, started.Status)
		require.Equal(t, "NOOP", started.ProviderKind)
		require.Equal(t, "SEND_INVOICE", started.CollectionMethod)
		require.EqualValues(t, 30, started.DaysUntilDue)
		require.Nil(t, started.DaysUntilDueOverride)
		require.Equal(t, s.monthly.ID, started.BasePrice.ID)
		require.Equal(t, "MONTHLY", started.BillingPeriod)
		require.Equal(t, started.AnchorAt, started.StartedAt)
		require.Equal(t, started.AnchorAt, started.CurrentPeriodStart)
		require.Equal(t, started.AnchorAt.Truncate(time.Second), started.AnchorAt)
		require.WithinDuration(t, time.Now(), started.AnchorAt, time.Minute)

		invoice := started.ActivationInvoice
		require.NotNil(t, invoice)
		require.Equal(t, "ACTIVATION", invoice.Kind)
		require.Equal(t, invoices.StatusManual, invoice.Status)
		require.Equal(t, invoices.HandoffPending, invoice.HandoffStatus)
		require.EqualValues(t, 2900, invoice.Total)
		require.True(t, invoice.BoundaryAt.Equal(started.AnchorAt))
		require.True(t, invoice.ServiceFrom.Equal(started.AnchorAt))
		require.True(t, invoice.ServiceTo.Equal(started.CurrentPeriodEnd))
		require.EqualValues(t, 30, *invoice.DaysUntilDue)
		require.True(t, invoice.DueAt.Equal(invoice.IssuedAt.AddDate(0, 0, 30)))

		read := commonfixture.AssertJSONResponse[subscriptions.InstanceBilling](t,
			call(t, "GET", "/api/instances/"+s.instance.Slug+"/billing", nil), fiber.StatusOK)
		require.Equal(t, started.InstanceBilling, read)

		require.Len(t, outboxPayloads(t, "INSTANCE_BILLING_STARTED"), 1)
		issued := outboxPayloads(t, "INSTANCE_INVOICE_ISSUED")
		require.Len(t, issued, 1)
		require.Equal(t, invoice.ID.String(), issued[0]["id"])
		require.Len(t, issued[0]["lines"], 1)
		for _, name := range []string{"INSTANCE_BILLING_STARTED", "INSTANCE_INVOICE_ISSUED"} {
			for _, payload := range outboxPayloads(t, name) {
				encoded, err := json.Marshal(payload)
				require.NoError(t, err)
				require.NotContains(t, string(encoded), "billing@", "%s carries the billing e-mail", name)
			}
		}
	})

	t.Run("ItsOwnTerms_WinOverTheOrganizations", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		resp := call(t, "PUT", "/api/billing/settings", map[string]any{"defaultCollectionMethod": "SEND_INVOICE", "defaultDaysUntilDue": 10, "handoffStripeInvoices": false})
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID, "daysUntilDue": 14})
		require.EqualValues(t, 14, started.DaysUntilDue)
		require.EqualValues(t, 14, *started.DaysUntilDueOverride)
		require.EqualValues(t, 14, *started.ActivationInvoice.DaysUntilDue)
	})

	t.Run("TheOrganizationsTerms_ApplyWhenItHasNone", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		resp := call(t, "PUT", "/api/billing/settings", map[string]any{"defaultCollectionMethod": "SEND_INVOICE", "defaultDaysUntilDue": 10, "handoffStripeInvoices": false})
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.EqualValues(t, 10, started.DaysUntilDue)
		require.EqualValues(t, 10, *started.ActivationInvoice.DaysUntilDue)
	})

	t.Run("AnArrearsBase_HasNoActivationInvoice", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		arrears := flatFee("2900", "MONTHLY")
		arrears["billingTiming"] = "ARREARS"
		s := newSold(t, arrears)
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.Nil(t, started.ActivationInvoice)
		require.Empty(t, outboxPayloads(t, "INSTANCE_INVOICE_ISSUED"))
	})

	t.Run("NothingOwed_IsPaidAtIssue_AndNeverHandedOff", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("0", "MONTHLY"))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		invoice := started.ActivationInvoice
		require.Equal(t, invoices.StatusPaid, invoice.Status)
		require.Equal(t, invoices.HandoffNotRequired, invoice.HandoffStatus)
		require.True(t, invoice.PaidAt.Equal(*invoice.IssuedAt))
		require.EqualValues(t, 0, *invoice.DaysUntilDue)
		require.Empty(t, outboxPayloads(t, "INSTANCE_INVOICE_ISSUED"))
		paid := outboxPayloads(t, "INSTANCE_INVOICE_PAID")
		require.Len(t, paid, 1)
		require.Equal(t, "ZERO_TOTAL", paid[0]["source"])
	})

	t.Run("APastStart_AnchorsThePeriods_WithinOnePeriodBack", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		path := "/api/instances/" + s.instance.Slug + "/billing"
		require.Equal(t, "SubscribeInstance.StartAtInFuture", problemCode(t, fiber.StatusUnprocessableEntity, "POST", path,
			map[string]any{"basePriceId": s.monthly.ID, "startAt": time.Now().UTC().Add(time.Hour)}))
		require.Equal(t, "SubscribeInstance.StartAtTooEarly", problemCode(t, fiber.StatusUnprocessableEntity, "POST", path,
			map[string]any{"basePriceId": s.monthly.ID, "startAt": time.Now().UTC().AddDate(0, -1, -2)}))

		startAt := time.Now().UTC().AddDate(0, 0, -10).Add(123 * time.Millisecond)
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID, "startAt": startAt})
		require.True(t, started.AnchorAt.Equal(startAt.Truncate(time.Second)))
		require.True(t, started.CurrentPeriodEnd.Equal(started.AnchorAt.AddDate(0, 1, 0)))
	})

	t.Run("WhatItSubscribesTo_IsChecked", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		path := "/api/instances/" + s.instance.Slug + "/billing"
		newEntitlement(t, "tokens", 0)
		grant(t, s.version.Slug, "tokens", 1000, 50)
		overage := createPrice(t, s.version.Slug, metered("OVERAGE", "tokens", "1"))
		deprecated := createPrice(t, s.version.Slug, flatFee("29000", "ANNUAL"))
		resp := call(t, "POST", "/api/licenses/"+s.version.Slug+"/prices/"+deprecated.ID.String()+"/deprecate", nil)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		other := newVersion(t, "Other", licenseschema.Published)
		elsewhere := createPrice(t, other.Slug, flatFee("100", "MONTHLY"))

		require.Equal(t, "SubscribeInstance.InstanceNotFound", problemCode(t, fiber.StatusNotFound, "POST",
			"/api/instances/nope/billing", map[string]any{"basePriceId": s.monthly.ID}))
		require.Equal(t, "SubscribeInstance.PriceNotFound", problemCode(t, fiber.StatusNotFound, "POST", path,
			map[string]any{"basePriceId": "00000000-0000-0000-0000-000000000001"}))
		for name, tc := range map[string]struct {
			body map[string]any
			code string
		}{
			"another version's price": {map[string]any{"basePriceId": elsewhere.ID}, "SubscribeInstance.PriceNotOnInstanceLicense"},
			"a metered price":         {map[string]any{"basePriceId": overage.ID}, "SubscribeInstance.PriceNotFlatFee"},
			"a deprecated price":      {map[string]any{"basePriceId": deprecated.ID}, "SubscribeInstance.PriceDeprecated"},
			"terms beyond a year":     {map[string]any{"basePriceId": s.monthly.ID, "daysUntilDue": 400}, "SubscribeInstance.InvalidDaysUntilDue"},
		} {
			require.Equal(t, tc.code, problemCode(t, fiber.StatusUnprocessableEntity, "POST", path, tc.body), name)
		}

		subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.Equal(t, "SubscribeInstance.AlreadySubscribed", problemCode(t, fiber.StatusConflict, "POST", path,
			map[string]any{"basePriceId": s.monthly.ID}))
	})

	t.Run("AnInstanceOfAnUnpublishedVersion_CannotBeSubscribed", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		exec(t, `UPDATE license SET lifecycle_state = 'DRAFT' WHERE id = $1`, s.version.ID)
		require.Equal(t, "SubscribeInstance.LicenseNotPublished", problemCode(t, fiber.StatusUnprocessableEntity, "POST",
			"/api/instances/"+s.instance.Slug+"/billing", map[string]any{"basePriceId": s.monthly.ID}))
	})

	t.Run("ACanceledSubscription_IsSubscribedAgainOnTheSameRow", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		first := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID, "startAt": time.Now().UTC().AddDate(0, 0, -20)})
		exec(t, `UPDATE instance_billing SET status = 'CANCELED', canceled_at = now() WHERE id = $1`, first.ID)

		require.Equal(t, "SubscribeInstance.BoundaryConflict", problemCode(t, fiber.StatusConflict, "POST", "/api/instances/"+s.instance.Slug+"/billing",
			map[string]any{"basePriceId": s.monthly.ID, "startAt": first.AnchorAt}))

		again := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.Equal(t, first.ID, again.ID)
		require.Equal(t, subscriptions.StatusActive, again.Status)
		require.Nil(t, again.CanceledAt)
		require.True(t, again.AnchorAt.After(first.AnchorAt))
		var resubscribed []any
		for _, payload := range outboxPayloads(t, "INSTANCE_BILLING_STARTED") {
			resubscribed = append(resubscribed, payload["resubscribed"])
		}
		require.ElementsMatch(t, []any{false, true}, resubscribed)
	})

	t.Run("AnInstanceNeverSubscribed_HasNoSubscription", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		s := newSold(t, flatFee("2900", "MONTHLY"))
		require.Equal(t, "GetInstanceBilling.NotFound", problemCode(t, fiber.StatusNotFound, "GET", "/api/instances/"+s.instance.Slug+"/billing", nil))
		require.Equal(t, "GetInstanceBilling.NotFound", problemCode(t, fiber.StatusNotFound, "GET", "/api/instances/nope/billing", nil))
	})

	t.Run("BehindTheBillingGate", func(t *testing.T) {
		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t,
			callOn(t, disabledServer, "POST", "/api/instances/any/billing", map[string]any{"basePriceId": "00000000-0000-0000-0000-000000000001"}), fiber.StatusForbidden)
		require.Equal(t, "Billing.Disabled", problem.Code)
	})
}

// A live subscription freezes what it bills: the instance's customer and
// licence. Everything else about the instance stays editable.
func TestSubscriptionFreezesTheInstance(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	s := newSold(t, flatFee("2900", "MONTHLY"))
	subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
	other := newVersion(t, "Scale", licenseschema.Published)
	put := func(licenseID any, name string) map[string]any {
		return map[string]any{
			"name": name, "description": "d", "customerId": s.instance.CustomerID, "licenseId": licenseID,
			"startLicenseDate": s.instance.StartLicenseDate, "endLicenseDate": s.instance.EndLicenseDate, "metadata": map[string]any{},
		}
	}
	path := "/api/instances/" + s.instance.Slug

	require.Equal(t, "UpdateInstance.BillingActive", problemCode(t, fiber.StatusConflict, "PUT", path, put(other.ID, "Acme prod")))

	resp := call(t, "PUT", path, put(s.version.ID, "Acme production"))
	require.Less(t, resp.StatusCode, 300, "a rename leaves the contract alone")

	exec(t, `UPDATE instance_billing SET status = 'CANCELED', canceled_at = now() WHERE instance_id = $1`, s.instance.ID)
	resp = call(t, "PUT", path, put(other.ID, "Acme production"))
	require.Less(t, resp.StatusCode, 300, "a canceled subscription freezes nothing")
}

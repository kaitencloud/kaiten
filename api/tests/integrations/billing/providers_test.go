package billing_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider/fakeprovider"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingcapabilities"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillinghealth"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/syncprovider"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

var unavailable = &provider.Error{Class: provider.ClassUnavailable, Code: "api_error", Param: "", RequestID: "req_1", Message: "try again"}

func pcall(t *testing.T, method, path string, payload any) *http.Response {
	t.Helper()
	return callOn(t, providerServer, method, path, payload)
}

func pinvoice(t *testing.T, id uuid.UUID) invoices.Invoice {
	t.Helper()
	return commonfixture.AssertJSONResponse[invoices.Invoice](t, pcall(t, "GET", "/api/invoices/"+id.String(), nil), fiber.StatusOK)
}

// waitStatus waits for the push job to bring an invoice to a status.
func waitStatus(t *testing.T, id uuid.UUID, status string) invoices.Invoice {
	t.Helper()
	var last invoices.Invoice
	require.Eventually(t, func() bool {
		last = pinvoice(t, id)
		return last.Status == status
	}, 10*time.Second, 25*time.Millisecond, "invoice %s never became %s", id, status)
	return last
}

// waitFor waits for an invoice to satisfy a condition.
func waitFor(t *testing.T, id uuid.UUID, condition func(invoices.Invoice) bool, what string) invoices.Invoice {
	t.Helper()
	var last invoices.Invoice
	require.Eventually(t, func() bool {
		last = pinvoice(t, id)
		return condition(last)
	}, 10*time.Second, 25*time.Millisecond, what)
	return last
}

// pushedSubscription subscribes a sold instance through the provider; its
// ACTIVATION invoice (29.00 EUR) enters the push queue.
func pushedSubscription(t *testing.T) (sold, subscribeinstance.StartedSubscription) {
	t.Helper()
	s := newSold(t, flatFee("2900", "MONTHLY"))
	started := commonfixture.AssertJSONResponse[subscribeinstance.StartedSubscription](t,
		pcall(t, "POST", "/api/instances/"+s.instance.Slug+"/billing", map[string]any{"basePriceId": s.monthly.ID, "providerKind": "STRIPE"}),
		fiber.StatusCreated)
	require.Equal(t, "STRIPE", started.ProviderKind)
	require.NotNil(t, started.ActivationInvoice)
	return s, started
}

func TestPushInvoices(t *testing.T) {
	t.Run("AnInvoice_IsPushedFinalizedAndReconciled", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, false)
		_, started := pushedSubscription(t)
		require.Equal(t, "DRAFT", started.ActivationInvoice.Status, "it waits in the push queue")
		require.Equal(t, 1, fake.Customers(), "the customer was registered before subscribing")

		pushed := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool {
			return i.Status == "PUSHED" && i.Provider != nil && i.Provider.ReconciliationStatus != nil
		}, "the invoice is pushed and reconciled")
		require.Equal(t, "MATCHED", *pushed.Provider.ReconciliationStatus)
		require.NotNil(t, pushed.Provider.ExternalInvoiceID)
		require.NotNil(t, pushed.Provider.InvoiceNumber)
		require.NotNil(t, pushed.Provider.HostedInvoiceURL)
		require.NotNil(t, pushed.IssuedAt)
		require.NotNil(t, pushed.DueAt)
		require.Equal(t, "NOT_REQUIRED", pushed.HandoffStatus, "a provider's invoice skips the handoff queue by default")
		require.NotNil(t, pushed.Lines[0].Provider)
		require.EqualValues(t, 2900, *pushed.Lines[0].Provider.Amount)
		require.Len(t, fake.Invoices(pushed.ID), 1)
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_PUSHED"), 1)
		issued := outboxPayloads(t, "INSTANCE_INVOICE_ISSUED")
		require.Len(t, issued, 1)
	})

	t.Run("AFailedStep_IsRetried_AndResumesWithoutDuplicates", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, false)
		fake.FailNext(fakeprovider.OpAddLine, unavailable)
		_, started := pushedSubscription(t)

		pushed := waitStatus(t, started.ActivationInvoice.ID, "PUSHED")
		require.GreaterOrEqual(t, pushed.Provider.PushAttempts, int32(1))
		require.Len(t, fake.Invoices(pushed.ID), 1, "one provider invoice")
		require.Len(t, fake.Invoices(pushed.ID)[0].Lines, len(pushed.Lines), "one provider line per line")
		require.Equal(t, 1, fake.Calls(fakeprovider.OpCreateDraft), "the draft was not created again")
	})

	t.Run("ALostAnswer_IsAdopted_AfterTheKeysAreGone", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, false)
		fake.LoseNext(fakeprovider.OpCreateDraft)
		fake.FailNext(fakeprovider.OpFindInvoice, unavailable)
		_, started := pushedSubscription(t)

		failed := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool {
			return i.Provider != nil && i.Provider.PushAttempts >= 2
		}, "the draft's answer was lost, then the search failed")
		require.NotNil(t, failed.Provider)
		fake.ForgetKeys()

		pushed := waitStatus(t, started.ActivationInvoice.ID, "PUSHED")
		require.Len(t, fake.Invoices(pushed.ID), 1, "the draft created by the lost call was adopted")
		require.Equal(t, fake.Invoices(pushed.ID)[0].ExternalID, *pushed.Provider.ExternalInvoiceID)
	})

	t.Run("ReviewMode_LeavesTheDraftForAHuman", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, true)
		_, started := pushedSubscription(t)

		draft := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool {
			return i.Provider != nil && i.Provider.ExternalInvoiceID != nil && i.Provider.NextPushAt == nil
		}, "the draft waits in the provider")
		require.Equal(t, "DRAFT", draft.Status)
		require.Equal(t, "draft", *draft.Provider.Status)
		require.Nil(t, draft.IssuedAt, "not issued, not due")

		retried := commonfixture.AssertJSONResponse[invoices.Invoice](t,
			pcall(t, "POST", "/api/invoices/"+draft.ID.String()+"/retry-push", nil), fiber.StatusAccepted)
		require.Equal(t, "PUSHED", retried.Status, "retry-push finalizes a draft under review")
		require.Equal(t, 1, fake.Calls(fakeprovider.OpFinalize))
	})

	t.Run("RepeatedFailures_AreAnnouncedOnce", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, false)
		rejected := &provider.Error{Class: provider.ClassRejected, Code: "email_invalid", Param: "email", RequestID: "req_2", Message: "invalid e-mail"}
		fake.FailNext(fakeprovider.OpEnsureCustomer, unavailable) // subscribe's own call succeeds below
		fake.FailNext(fakeprovider.OpCreateDraft, rejected)
		fake.FailNext(fakeprovider.OpCreateDraft, rejected)
		s := newSold(t, flatFee("2900", "MONTHLY"))
		require.Equal(t, "SubscribeInstance.ProviderUnavailable", problemCodeOn(t, providerServer, fiber.StatusServiceUnavailable, "POST",
			"/api/instances/"+s.instance.Slug+"/billing", map[string]any{"basePriceId": s.monthly.ID, "providerKind": "STRIPE"}))
		started := commonfixture.AssertJSONResponse[subscribeinstance.StartedSubscription](t,
			pcall(t, "POST", "/api/instances/"+s.instance.Slug+"/billing", map[string]any{"basePriceId": s.monthly.ID, "providerKind": "STRIPE"}),
			fiber.StatusCreated)

		pushed := waitStatus(t, started.ActivationInvoice.ID, "PUSHED")
		require.EqualValues(t, 2, pushed.Provider.PushAttempts)
		alerts := outboxPayloads(t, "INSTANCE_INVOICE_PUSH_FAILED")
		require.Len(t, alerts, 1, "announced at the threshold")
		require.Contains(t, alerts[0]["lastPushError"], "email_invalid")
	})

	t.Run("NothingOwed_IsNeverPushed", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, false)
		s := newSold(t, flatFee("0", "MONTHLY"))
		started := commonfixture.AssertJSONResponse[subscribeinstance.StartedSubscription](t,
			pcall(t, "POST", "/api/instances/"+s.instance.Slug+"/billing", map[string]any{"basePriceId": s.monthly.ID, "providerKind": "STRIPE"}),
			fiber.StatusCreated)
		require.Equal(t, "PAID", started.ActivationInvoice.Status)
		time.Sleep(200 * time.Millisecond)
		require.Empty(t, fake.Invoices(started.ActivationInvoice.ID))
	})
}

func problemCodeOn(t *testing.T, server *tests.TestServer, status int, method, path string, payload any) string {
	t.Helper()
	return commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, callOn(t, server, method, path, payload), status).Code
}

func TestProviderSync(t *testing.T) {
	sync := func(t *testing.T) syncprovider.SyncReport {
		t.Helper()
		return commonfixture.AssertJSONResponse[syncprovider.SyncReport](t, pcall(t, "POST", "/api/billing/sync", nil), fiber.StatusAccepted)
	}

	t.Run("APayment_AndAVoid_InTheProvider_AreMirrored", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, false)
		_, started := pushedSubscription(t)
		pushed := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool {
			return i.Status == "PUSHED" && i.Provider.ReconciliationStatus != nil
		}, "pushed")

		fake.PayInProvider(*pushed.Provider.ExternalInvoiceID)
		report := sync(t)
		require.Len(t, report.Providers, 1)
		require.Equal(t, "SUCCESS", report.Providers[0].Status)
		paid := pinvoice(t, pushed.ID)
		require.Equal(t, "PAID", paid.Status)
		require.Equal(t, "paid", *paid.Provider.Status)
		payments := outboxPayloads(t, "INSTANCE_INVOICE_PAID")
		require.Len(t, payments, 1)
		require.Equal(t, "PROVIDER", payments[0]["source"])
		sync(t)
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_PAID"), 1, "applying a state twice changes nothing")
	})

	t.Run("AVoid_AndADeletedDraft", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, false)
		_, first := pushedSubscription(t)
		pushed := waitStatus(t, first.ActivationInvoice.ID, "PUSHED")
		fake.VoidInProvider(*pushed.Provider.ExternalInvoiceID)

		providers.use(t, true)
		review := providers.fake
		_, second := pushedSubscription(t)
		draft := waitFor(t, second.ActivationInvoice.ID, func(i invoices.Invoice) bool {
			return i.Provider != nil && i.Provider.ExternalInvoiceID != nil && i.Provider.NextPushAt == nil
		}, "the draft waits for review")
		review.DeleteDraft(*draft.Provider.ExternalInvoiceID)
		sync(t)
		deleted := pinvoice(t, draft.ID)
		require.Equal(t, "VOID", deleted.Status)
		require.Equal(t, "provider_draft_deleted", *deleted.VoidReason)
	})

	t.Run("AFinalizationInTheProvider_IsIssuedAndReconciled", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, true)
		_, started := pushedSubscription(t)
		draft := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool {
			return i.Provider != nil && i.Provider.ExternalInvoiceID != nil && i.Provider.NextPushAt == nil
		}, "the draft waits for review")
		fake.FinalizeInProvider(*draft.Provider.ExternalInvoiceID)

		synced := commonfixture.AssertJSONResponse[invoices.Invoice](t,
			pcall(t, "POST", "/api/invoices/"+draft.ID.String()+"/sync", nil), fiber.StatusOK)
		require.Equal(t, "PUSHED", synced.Status)
		require.Equal(t, "MATCHED", *synced.Provider.ReconciliationStatus)
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_ISSUED"), 1)
	})

	t.Run("AnEditInTheProvider_IsAMismatch", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, true)
		_, started := pushedSubscription(t)
		draft := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool {
			return i.Provider != nil && i.Provider.ExternalInvoiceID != nil && i.Provider.NextPushAt == nil
		}, "the draft waits for review")
		fake.EditLine(*draft.Provider.ExternalInvoiceID, *draft.Lines[0].ID, 1900)
		fake.FinalizeInProvider(*draft.Provider.ExternalInvoiceID)
		sync(t)

		mismatched := pinvoice(t, draft.ID)
		require.Equal(t, "PUSHED", mismatched.Status, "Kaiten never corrects itself")
		require.Equal(t, "MISMATCH", *mismatched.Provider.ReconciliationStatus)
		detail := mismatched.Provider.ReconciliationDetails
		require.Len(t, detail.Lines, 1)
		require.EqualValues(t, 2900, detail.Lines[0].KaitenAmount)
		require.EqualValues(t, 1900, detail.Lines[0].ProviderAmount)
		require.EqualValues(t, 1900, detail.Totals.ProviderTotalExcludingTax)
		require.Len(t, outboxPayloads(t, "INSTANCE_INVOICE_RECONCILIATION_MISMATCH"), 1)
		require.EqualValues(t, 1, commonfixture.AssertJSONResponse[getbillinghealth.BillingHealth](t,
			pcall(t, "GET", "/api/billing/health", nil), fiber.StatusOK).ReconciliationMismatches30d)
	})

	t.Run("FeedFailures_AreCounted_AndAnnouncedOncePerStreak", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, false)
		_, started := pushedSubscription(t)
		waitStatus(t, started.ActivationInvoice.ID, "PUSHED")
		for range 4 {
			fake.FailNext(fakeprovider.OpListEvents, unavailable)
			require.Equal(t, "FAILED", sync(t).Providers[0].Status)
		}
		require.Len(t, outboxPayloads(t, "BILLING_PROVIDER_SYNC_FAILED"), 1)
		health := commonfixture.AssertJSONResponse[getbillinghealth.BillingHealth](t, pcall(t, "GET", "/api/billing/health", nil), fiber.StatusOK)
		require.Len(t, health.ProviderSync, 1)
		require.EqualValues(t, 4, health.ProviderSync[0].ConsecutiveFailures)
		require.Equal(t, "SUCCESS", sync(t).Providers[0].Status)
	})

	t.Run("WithoutAProvider_ThereIsNothingToSync", func(t *testing.T) {
		t.Cleanup(func() {
			providers.connect(true)
			require.NoError(t, testDb.Reset())
		})
		providers.use(t, false)
		providers.connect(false)
		require.Equal(t, "SyncProvider.NotConnected", problemCodeOn(t, providerServer, fiber.StatusConflict, "POST", "/api/billing/sync", nil))
	})
}

func TestProviderVoid(t *testing.T) {
	t.Run("APushedInvoice_IsVoidedInTheProviderFirst", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, false)
		_, started := pushedSubscription(t)
		pushed := waitStatus(t, started.ActivationInvoice.ID, "PUSHED")
		path := "/api/invoices/" + pushed.ID.String() + "/void"

		fake.FailNext(fakeprovider.OpVoidInvoice, unavailable)
		require.Equal(t, "VoidInvoice.ProviderUnavailable", problemCodeOn(t, providerServer, fiber.StatusServiceUnavailable, "POST", path,
			map[string]any{"reason": "wrong plan"}))
		require.Equal(t, "PUSHED", pinvoice(t, pushed.ID).Status, "Kaiten unchanged until the provider confirms")

		voided := commonfixture.AssertJSONResponse[invoices.Invoice](t, pcall(t, "POST", path, map[string]any{"reason": "wrong plan"}), fiber.StatusOK)
		require.Equal(t, "VOID", voided.Status)
		require.Equal(t, provider.StatusVoid, fake.Invoices(pushed.ID)[0].Status)
	})

	t.Run("AnInvoicePaidInTheProvider_IsNotVoided", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, false)
		_, started := pushedSubscription(t)
		pushed := waitStatus(t, started.ActivationInvoice.ID, "PUSHED")
		fake.PayInProvider(*pushed.Provider.ExternalInvoiceID)
		require.Equal(t, "VoidInvoice.InvalidStatus", problemCodeOn(t, providerServer, fiber.StatusConflict, "POST",
			"/api/invoices/"+pushed.ID.String()+"/void", map[string]any{"reason": "late"}))
	})

	t.Run("AVoidDuringAPush_RemovesWhatThePushCreated", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, true)
		_, started := pushedSubscription(t)
		draft := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool {
			return i.Provider != nil && i.Provider.ExternalInvoiceID != nil && i.Provider.NextPushAt == nil
		}, "the draft waits for review")
		voided := commonfixture.AssertJSONResponse[invoices.Invoice](t,
			pcall(t, "POST", "/api/invoices/"+draft.ID.String()+"/void", map[string]any{"reason": "changed my mind"}), fiber.StatusOK)
		require.Equal(t, "VOID", voided.Status)
		_, err := fake.GetInvoice(t.Context(), provider.Ref{}, *draft.Provider.ExternalInvoiceID)
		require.Equal(t, provider.ClassNotFound, provider.ClassOf(err), "the provider's draft was deleted")
	})
}

func TestProviderSwitch(t *testing.T) {
	t.Run("ASubscription_MovesToTheProvider_FromItsNextInvoice", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		fake := providers.use(t, false)
		s := newSold(t, flatFee("2900", "MONTHLY"))
		started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
		require.Equal(t, "MANUAL", started.ActivationInvoice.Status)
		path := "/api/instances/" + s.instance.Slug + "/billing"

		exec(t, `UPDATE customer SET billing_email = NULL WHERE id = (SELECT customer_id FROM instance_billing WHERE id = $1)`, started.ID)
		require.Equal(t, "UpdateInstanceBilling.BillingEmailMissing", problemCodeOn(t, providerServer, fiber.StatusUnprocessableEntity, "PATCH", path,
			map[string]any{"providerKind": "STRIPE"}))
		exec(t, `UPDATE customer SET billing_email = 'billing@acme.test' WHERE id = (SELECT customer_id FROM instance_billing WHERE id = $1)`, started.ID)
		require.Equal(t, "UpdateInstanceBilling.CollectionMethodUnsupported", problemCodeOn(t, providerServer, fiber.StatusUnprocessableEntity, "PATCH", path,
			map[string]any{"providerKind": "STRIPE", "collectionMethod": "CHARGE_AUTOMATICALLY"}))
		fake.Currencies("USD")
		require.Equal(t, "UpdateInstanceBilling.UnsupportedCurrency", problemCodeOn(t, providerServer, fiber.StatusUnprocessableEntity, "PATCH", path,
			map[string]any{"providerKind": "STRIPE"}))
		fake.Currencies()
		providers.connect(false)
		require.Equal(t, "UpdateInstanceBilling.ProviderNotConnected", problemCodeOn(t, providerServer, fiber.StatusUnprocessableEntity, "PATCH", path,
			map[string]any{"providerKind": "STRIPE"}))
		providers.connect(true)

		switched := commonfixture.AssertJSONResponse[subscriptions.InstanceBilling](t, pcall(t, "PATCH", path, map[string]any{"providerKind": "STRIPE"}), fiber.StatusOK)
		require.Equal(t, "STRIPE", switched.ProviderKind)
		require.Equal(t, 1, fake.Customers())
		changes := outboxPayloads(t, "INSTANCE_BILLING_PROVIDER_CHANGED")
		require.Len(t, changes, 1)
		require.Equal(t, "NOOP", changes[0]["from"])
		require.Equal(t, "STRIPE", changes[0]["to"])
		require.Equal(t, "MANUAL", pinvoice(t, started.ActivationInvoice.ID).Status, "invoices already composed keep their provider")

		backdate(t, started.ID, 1)
		report := commonfixture.AssertJSONResponse[closing.ClosePeriodsReport](t, pcall(t, "POST", "/api/billing/close-periods", map[string]any{}), fiber.StatusOK)
		require.Equal(t, 1, report.Closed)
		renewal := waitStatus(t, report.Invoices[0].ID, "PUSHED")
		require.Equal(t, "STRIPE", renewal.ProviderKind)

		back := commonfixture.AssertJSONResponse[subscriptions.InstanceBilling](t, pcall(t, "PATCH", path, map[string]any{"providerKind": "NOOP"}), fiber.StatusOK)
		require.Equal(t, "NOOP", back.ProviderKind)
		commonfixture.AssertJSONResponse[invoices.Invoice](t,
			pcall(t, "POST", "/api/invoices/"+renewal.ID.String()+"/void", map[string]any{"reason": "back to manual"}), fiber.StatusOK)
		require.Equal(t, 1, fake.Calls(fakeprovider.OpVoidInvoice), "an older provider invoice is still voided there")
	})

	t.Run("Capabilities_ListTheProviders", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		providers.use(t, false)
		capabilities := commonfixture.AssertJSONResponse[getbillingcapabilities.BillingCapabilities](t,
			pcall(t, "GET", "/api/billing/capabilities", nil), fiber.StatusOK)
		require.Len(t, capabilities.Providers, 2)
		require.Equal(t, "NOOP", capabilities.Providers[0].Kind)
		require.Equal(t, "STRIPE", capabilities.Providers[1].Kind)
		require.True(t, capabilities.Providers[1].Connected)

		onlyNoop := commonfixture.AssertJSONResponse[getbillingcapabilities.BillingCapabilities](t,
			call(t, "GET", "/api/billing/capabilities", nil), fiber.StatusOK)
		require.Len(t, onlyNoop.Providers, 2, "NOOP, and the shipped Stripe, not connected")
		require.False(t, onlyNoop.Providers[1].Connected)
		require.Equal(t, "SubscribeInstance.ProviderNotConnected", commonfixture.AssertJSONResponse[kaitenerrors.Problem](t,
			call(t, "POST", "/api/instances/any/billing", map[string]any{"basePriceId": uuid.New(), "providerKind": "STRIPE"}),
			fiber.StatusUnprocessableEntity).Code)
	})
}

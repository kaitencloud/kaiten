package billing_test

import (
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

const (
	sessionCancelPath     = "/api/public/session/billing/cancel"
	sessionReactivatePath = "/api/public/session/billing/reactivate"
)

// §14.4: a customer cancels its subscription at the period's end, and takes
// it back, through a session bound to the instance -- never immediately, never
// another instance's.
func TestSessionCancelAndReactivate(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	s := newSold(t, flatFee("2900", "MONTHLY"))
	started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
	newPublishableKey(t, storefront)
	customerSlug := s.instance.CustomerSlug
	bound := mintSession(t, testServer, customerSlug, s.instance.Slug)
	unbound := mintSession(t, testServer, customerSlug, "")

	require.Equal(t, "CancelSessionSubscription.InstanceRequired", sessionProblem(t,
		sessionCall(t, testServer, "POST", sessionCancelPath, unbound.Token, storefront, map[string]any{}), fiber.StatusUnprocessableEntity))
	require.Equal(t, "ReactivateSessionSubscription.InstanceRequired", sessionProblem(t,
		sessionCall(t, testServer, "POST", sessionReactivatePath, unbound.Token, storefront, nil), fiber.StatusUnprocessableEntity))
	require.Equal(t, "ReactivateSessionSubscription.NotScheduledForCancellation", sessionProblem(t,
		sessionCall(t, testServer, "POST", sessionReactivatePath, bound.Token, storefront, nil), fiber.StatusConflict))
	require.Equal(t, "CancelSessionSubscription.InvalidReason", sessionProblem(t,
		sessionCall(t, testServer, "POST", sessionCancelPath, bound.Token, storefront, map[string]any{"reason": strings.Repeat("x", 501)}),
		fiber.StatusUnprocessableEntity), "the Core rule, under the session operation's name")

	// At the period's end, whatever the customer asks: the period paid for runs out.
	canceled := commonfixture.AssertJSONResponse[sessions.SessionSubscription](t,
		sessionCall(t, testServer, "POST", sessionCancelPath, bound.Token, storefront, map[string]any{"reason": "too expensive"}), fiber.StatusOK)
	require.Equal(t, "ACTIVE", canceled.Status)
	require.True(t, canceled.CancelAtPeriodEnd)
	require.True(t, canceled.CurrentPeriodEnd.Equal(started.CurrentPeriodEnd))
	again := commonfixture.AssertJSONResponse[sessions.SessionSubscription](t,
		sessionCall(t, testServer, "POST", sessionCancelPath, bound.Token, storefront, map[string]any{}), fiber.StatusOK)
	require.Equal(t, canceled, again, "repeating it changes nothing")
	require.Len(t, outboxPayloads(t, "INSTANCE_BILLING_CANCELLATION_SCHEDULED"), 1)
	vendor := commonfixture.AssertJSONResponse[subscriptions.InstanceBilling](t,
		call(t, "GET", "/api/instances/"+s.instance.Slug+"/billing", nil), fiber.StatusOK)
	require.Equal(t, "too expensive", *vendor.CancellationReason, "the vendor sees why")

	reactivated := commonfixture.AssertJSONResponse[sessions.SessionSubscription](t,
		sessionCall(t, testServer, "POST", sessionReactivatePath, bound.Token, storefront, nil), fiber.StatusOK)
	require.False(t, reactivated.CancelAtPeriodEnd)
	require.Len(t, outboxPayloads(t, "INSTANCE_BILLING_CANCELLATION_REVERTED"), 1)

	// While the period that ended is being closed, both wait.
	backdate(t, started.ID, 1)
	pending := sessionCall(t, testServer, "POST", sessionCancelPath, bound.Token, storefront, map[string]any{})
	require.Equal(t, "60", pending.Header.Get("Retry-After"))
	require.Equal(t, "CancelSessionSubscription.BoundaryPending", sessionProblem(t, pending, fiber.StatusConflict))

	// An instance of the same customer that was never subscribed.
	other := newInstance(t, "Acme staging", s.instance.CustomerID, s.version.ID)
	otherSession := mintSession(t, testServer, customerSlug, other.Slug)
	require.Equal(t, "CancelSessionSubscription.NotActive", sessionProblem(t,
		sessionCall(t, testServer, "POST", sessionCancelPath, otherSession.Token, storefront, map[string]any{}), fiber.StatusConflict))
	require.Equal(t, "ReactivateSessionSubscription.NotScheduledForCancellation", sessionProblem(t,
		sessionCall(t, testServer, "POST", sessionReactivatePath, otherSession.Token, storefront, nil), fiber.StatusConflict))
}

// TestSessionCancelEndsATrialAtOnce: a trial has nothing paid for to run out.
func TestSessionCancelEndsATrialAtOnce(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	s := newSold(t, flatFee("2900", "MONTHLY"))
	subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID, "trialDays": 14})
	newPublishableKey(t, storefront)
	bound := mintSession(t, testServer, s.instance.CustomerSlug, s.instance.Slug)

	canceled := commonfixture.AssertJSONResponse[sessions.SessionSubscription](t,
		sessionCall(t, testServer, "POST", sessionCancelPath, bound.Token, storefront, map[string]any{}), fiber.StatusOK)
	require.Equal(t, "CANCELED", canceled.Status)
	require.Equal(t, "CancelSessionSubscription.NotActive", sessionProblem(t,
		sessionCall(t, testServer, "POST", sessionCancelPath, bound.Token, storefront, map[string]any{}), fiber.StatusConflict))
	require.Equal(t, "ReactivateSessionSubscription.NotScheduledForCancellation", sessionProblem(t,
		sessionCall(t, testServer, "POST", sessionReactivatePath, bound.Token, storefront, nil), fiber.StatusConflict))
}

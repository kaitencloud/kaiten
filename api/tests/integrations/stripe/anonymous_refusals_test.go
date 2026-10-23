package stripe_test

import (
	"net/http"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	tier2 "github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	tier2events "github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// confirmProblem confirms and reads the refusal's code.
func confirmProblem(t *testing.T, opened tier2.CheckoutSessionStart, status int) string {
	t.Helper()
	problem := commonfixture.AssertJSONResponse[map[string]any](t, anonymousCall(t, "POST",
		"/api/public/checkout-sessions/"+opened.SessionID.String()+"/confirm", nil,
		map[string]string{"Authorization": "Bearer " + *opened.Token}), status)
	code, _ := problem["code"].(string)
	return code
}

func customersWithEmail(t *testing.T, email string) int {
	t.Helper()
	var n int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT count(*) FROM customer WHERE lower(billing_email) = lower($1)`, email).Scan(&n))
	return n
}

// TestAnonymousCheckoutCompletesOnce: confirms racing after the setup
// complete the session once (§9.12 rule 2): one customer, one instance, one
// completed event; the others answer the session as it now is (E-14).
func TestAnonymousCheckoutCompletesOnce(t *testing.T) {
	fresh(t)
	s := newStorefront(t, nil)
	opened := startAnonymous(t, s, "race@startup.test")
	pageID := setupSessionID(t, confirmAnonymous(t, opened))
	fake.CompleteSetupSession(stripefake.DefaultAccount, pageID, "visa", "4242", 12, 2030)

	const racers = 4
	statuses := make([]int, racers)
	var wg sync.WaitGroup
	for i := range racers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := commonfixture.NewJSONRequest(t, "POST", "/api/public/checkout-sessions/"+opened.SessionID.String()+"/confirm", nil)
			req.Header.Set("Origin", storefront)
			req.Header.Set("Authorization", "Bearer "+*opened.Token)
			resp, err := testServer.App.Test(req, fiber.TestConfig{Timeout: 0})
			if err == nil {
				statuses[i] = resp.StatusCode
				_ = resp.Body.Close()
			}
		}()
	}
	wg.Wait()
	for _, status := range statuses {
		require.Contains(t, []int{http.StatusOK, http.StatusConflict}, status)
	}
	require.Equal(t, 1, customersWithEmail(t, "race@startup.test"), "one customer, whoever won")
	require.Equal(t, 1, outboxCount(t, tier2events.CheckoutSessionCompleted.Name))
}

// TestAnonymousCheckoutRefusedAtConfirm: what changed since the start is
// refused before anything is written, and the session stays OPEN to be
// retried (§9.12 rule 3, §12.9): a fallback taken away, a creation limit of
// the vendor's own plan, and a trial consumed by another checkout after the
// card was given (E-14).
func TestAnonymousCheckoutRefusedAtConfirm(t *testing.T) {
	t.Run("the fallback taken away", func(t *testing.T) {
		fresh(t)
		s := newStorefront(t, nil)
		opened := startAnonymous(t, s, "nofallback@startup.test")
		families := fake.CallsOf(stripefake.OpCreateCheckoutSession)
		require.Equal(t, fiber.StatusOK, call(t, "PATCH", "/api/license-families/"+planFamilySlugOf(t, s.plan.FamilyID.String()),
			map[string]any{"fallbackLicenseFamilySlug": ""}).StatusCode)
		require.Equal(t, "ConfirmCheckoutSession.FallbackRequired", confirmProblem(t, opened, fiber.StatusUnprocessableEntity))
		require.Len(t, fake.CallsOf(stripefake.OpCreateCheckoutSession), len(families), "no card is asked for in vain")
	})

	t.Run("a creation limit of the vendor's plan", func(t *testing.T) {
		fresh(t)
		s := newStorefront(t, nil)
		opened := startAnonymous(t, s, "quota@startup.test")
		pageID := setupSessionID(t, confirmAnonymous(t, opened))
		fake.CompleteSetupSession(stripefake.DefaultAccount, pageID, "visa", "4242", 12, 2030)

		quotas.refuse(t, "instances")
		require.Equal(t, "ConfirmCheckoutSession.EntitlementLimitReached", confirmProblem(t, opened, fiber.StatusConflict))
		require.Equal(t, 1, quotas.compensations("customers"), "the customer reported first is given back")
		require.Zero(t, customersWithEmail(t, "quota@startup.test"))

		quotas.refused = nil // the vendor lifts its limit: the same session completes
		require.Equal(t, tier2.ConfirmCompleted, confirmAnonymous(t, opened).Status)
	})

	t.Run("a trial consumed after the card was given", func(t *testing.T) {
		fresh(t)
		s := newStorefront(t, map[string]any{"trialPeriodDays": 14, "requiresPaymentMethod": true})
		first := startAnonymous(t, s, "twice@startup.test")
		firstPage := setupSessionID(t, confirmAnonymous(t, first))

		second := startAnonymous(t, s, "TWICE@startup.test")
		secondPage := setupSessionID(t, confirmAnonymous(t, second))
		fake.CompleteSetupSession(stripefake.DefaultAccount, secondPage, "visa", "4242", 12, 2030)
		require.Equal(t, tier2.ConfirmCompleted, confirmAnonymous(t, second).Status, "the other checkout takes the trial")

		fake.CompleteSetupSession(stripefake.DefaultAccount, firstPage, "visa", "4242", 12, 2030)
		require.Equal(t, "ConfirmCheckoutSession.DueTodayChanged", confirmProblem(t, first, fiber.StatusConflict),
			"the card was given for a trial: it is never charged another amount")
		require.Equal(t, 1, customersWithEmail(t, "twice@startup.test"))
	})
}

// planFamilySlugOf is the slug of a licence family, by its id.
func planFamilySlugOf(t *testing.T, familyID string) string {
	t.Helper()
	page := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", "/api/license-families", nil), fiber.StatusOK)
	for _, item := range page["items"].([]any) {
		family := item.(map[string]any)
		if family["id"] == familyID {
			return family["slug"].(string)
		}
	}
	t.Fatalf("no family %s", familyID)
	return ""
}

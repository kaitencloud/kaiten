package stripe_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	billingstripe "github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	tier2 "github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	tier2events "github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// vendorSession is a checkout session as the vendor reads it.
func vendorSession(t *testing.T, opened tier2.CheckoutSessionStart) tier2.CheckoutSessionAdmin {
	t.Helper()
	return commonfixture.AssertJSONResponse[tier2.CheckoutSessionAdmin](t,
		call(t, "GET", "/api/checkout-sessions/"+opened.SessionID.String(), nil), fiber.StatusOK)
}

// TestAnonymousCheckoutSyncBackstop: a visitor who saved a card and never came
// back is completed by the sync (§12.6 rule 4): the setup's
// checkout.session.completed names its checkout session. A completion that
// fails -- here, the vendor's own plan refusing an instance -- leaves the
// session OPEN with its setup completed, and every pass retries it by id
// until it succeeds, the event long consumed.
func TestAnonymousCheckoutSyncBackstop(t *testing.T) {
	fresh(t)
	s := newStorefront(t, nil)
	opened := startAnonymous(t, s, "gone@startup.test")
	pageID := setupSessionID(t, confirmAnonymous(t, opened))
	fake.CompleteSetupSession(stripefake.DefaultAccount, pageID, "visa", "4242", 12, 2030)

	quotas.refuse(t, "instances")
	first := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/billing/sync", nil), fiber.StatusAccepted)
	raw, err := json.Marshal(first)
	require.NoError(t, err)
	require.Contains(t, string(raw), "PARTIAL", "the failed completion is said")
	require.Equal(t, tier2.StatusOpen, vendorSession(t, opened).Status, "left OPEN to be retried")
	require.Zero(t, customersWithEmail(t, "gone@startup.test"))

	quotas.mu.Lock()
	quotas.refused = nil // the vendor lifts its limit
	quotas.mu.Unlock()
	require.Equal(t, fiber.StatusAccepted, call(t, "POST", "/api/billing/sync", nil).StatusCode)
	require.Eventually(t, func() bool {
		return vendorSession(t, opened).Status == tier2.StatusCompleted
	}, 15*time.Second, 50*time.Millisecond, "retried by id, then paid through the push queue")
	require.Equal(t, 1, customersWithEmail(t, "gone@startup.test"))
	require.Equal(t, 1, outboxCount(t, tier2events.CheckoutSessionCompleted.Name))
}

// TestAnonymousCheckoutStepF: billing-lifecycle step (f) at a session's
// expiry (§16.2, §12.9): a completed setup is completed instead of reaped; an
// open setup page is waited for; a session that never set up is ABANDONED
// with checkout_session.v1.abandoned, and so is the waited one once its page
// expires.
func TestAnonymousCheckoutStepF(t *testing.T) {
	fresh(t)
	s := newStorefront(t, nil)
	finished := startAnonymous(t, s, "finished@startup.test")
	finishedPage := setupSessionID(t, confirmAnonymous(t, finished))
	fake.CompleteSetupSession(stripefake.DefaultAccount, finishedPage, "visa", "4242", 12, 2030)
	waiting := startAnonymous(t, s, "waiting@startup.test")
	waitingPage := setupSessionID(t, confirmAnonymous(t, waiting))
	never := startAnonymous(t, s, "never@startup.test")
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE checkout_session SET created_at = created_at - interval '25 hours', expires_at = expires_at - interval '25 hours'`)
	require.NoError(t, err)

	jobs := tests.NewTestServer(testDb, tests.TestServerOptions{
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			cfg.Billing.PeriodClose.Interval, cfg.Billing.Sync.Interval, cfg.Billing.Push.Interval = -1, -1, -1
			cfg.Billing.Lifecycle.Interval = 100 * time.Millisecond
			cfg.Billing.InitialDelay = 20 * time.Millisecond
		},
		ConnectorEntitlements: entitlements,
		UsageReporter:         quotas,
		Stripe:                billingstripe.Options{BaseURL: fake.URL(), HTTPClient: fake.Client()},
	})
	t.Cleanup(func() { require.NoError(t, jobs.Close()) })

	// An OPEN session past its expiry reads ABANDONED at once; reaped, it is
	// closed.
	require.Eventually(t, func() bool {
		return vendorSession(t, never).ClosedAt != nil && vendorSession(t, finished).Status != tier2.StatusOpen
	}, 20*time.Second, 100*time.Millisecond)
	require.Equal(t, tier2.StatusAbandoned, vendorSession(t, never).Status)
	require.Equal(t, 1, customersWithEmail(t, "finished@startup.test"), "completed, not reaped")
	require.Equal(t, 1, outboxCount(t, tier2events.CheckoutSessionAbandoned.Name))

	require.Nil(t, vendorSession(t, waiting).ClosedAt, "its page is still open")
	fake.ExpireSetupSession(stripefake.DefaultAccount, waitingPage)
	require.Eventually(t, func() bool {
		return vendorSession(t, waiting).ClosedAt != nil
	}, 20*time.Second, 100*time.Millisecond, "its page expired: reaped")
	require.Zero(t, customersWithEmail(t, "waiting@startup.test"))

	// Step (h): 90 days after it closed, a session is deleted, with no event.
	_, err = testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE checkout_session SET abandoned_at = abandoned_at - interval '91 days', closed_at = closed_at - interval '91 days' WHERE id = $1`, never.SessionID)
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		return call(t, "GET", "/api/checkout-sessions/"+never.SessionID.String(), nil).StatusCode == fiber.StatusNotFound
	}, 20*time.Second, 100*time.Millisecond, "deleted after its retention")
	require.Equal(t, fiber.StatusOK, call(t, "GET", "/api/checkout-sessions/"+waiting.SessionID.String(), nil).StatusCode, "closed just now: kept")
}

// TestSyncVisitsEveryConnectedOrganization: the sync job visits an
// organization whose Stripe connector is active even when it has no invoice
// and no sync state yet (Δ4.11), so a visitor who never came back from a
// first setup is completed within one interval.
func TestSyncVisitsEveryConnectedOrganization(t *testing.T) {
	fresh(t)
	s := newStorefront(t, nil)
	opened := startAnonymous(t, s, "first@startup.test")
	pageID := setupSessionID(t, confirmAnonymous(t, opened))
	fake.CompleteSetupSession(stripefake.DefaultAccount, pageID, "visa", "4242", 12, 2030)
	var states int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM billing_sync_state`).Scan(&states))
	require.Zero(t, states, "never synced")

	jobs := tests.NewTestServer(testDb, tests.TestServerOptions{
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			cfg.Billing.PeriodClose.Interval, cfg.Billing.Lifecycle.Interval, cfg.Billing.Push.Interval = -1, -1, -1
			cfg.Billing.Sync.Interval = 100 * time.Millisecond
			cfg.Billing.InitialDelay = 20 * time.Millisecond
		},
		ConnectorEntitlements: entitlements,
		UsageReporter:         quotas,
		Stripe:                billingstripe.Options{BaseURL: fake.URL(), HTTPClient: fake.Client()},
	})
	t.Cleanup(func() { require.NoError(t, jobs.Close()) })
	require.Eventually(t, func() bool {
		return vendorSession(t, opened).Status != tier2.StatusOpen
	}, 20*time.Second, 100*time.Millisecond, "completed by the sync job")
	require.Equal(t, 1, customersWithEmail(t, "first@startup.test"))
}

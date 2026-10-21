package billing_test

import (
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

const checkoutSessionsPath = "/api/public/checkout-sessions"

// anonymousKey is a publishable key that starts anonymous checkouts from the
// storefront, its Turnstile secret in a Vault fake.
func anonymousKey(t *testing.T) keys.PublishableKeyCreated {
	t.Helper()
	t.Setenv("VAULT_ADDR", "")
	t.Setenv("VAULT_FAKE_FILE_PATH", filepath.Join(t.TempDir(), "vault.json"))
	return commonfixture.AssertJSONResponse[keys.PublishableKeyCreated](t, call(t, "POST", "/api/publishable-keys", map[string]any{
		"label": "Pricing page", "allowedOrigins": []string{storefront},
		"anonymousCheckout": true, "turnstileSiteKey": "0x4AAAAAAAsite", "turnstileSecret": "turnstile-secret",
	}), fiber.StatusCreated)
}

// startCheckout posts a start from the storefront, as the gateway forwards it.
func startCheckout(t *testing.T, key string, body map[string]any) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, "POST", checkoutSessionsPath, body)
	req.Header.Set("X-Kaiten-Publishable-Key", key)
	req.Header.Set("Origin", storefront)
	req.Header.Set("X-Envoy-External-Address", "203.0.113.7")
	resp, err := testServer.App.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func startProblem(t *testing.T, key string, body map[string]any, status int) kaitenerrors.Problem {
	t.Helper()
	return commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, startCheckout(t, key, body), status)
}

func countCheckoutSessions(t *testing.T) int {
	t.Helper()
	var n int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM checkout_session`).Scan(&n))
	return n
}

// TestCheckoutSessionStart: the start of an anonymous checkout (V32-01,
// §14.8): the cheap refusals, then Turnstile, then the selection; a dryRun
// writes nothing; a real start writes the one session row and its event, and
// returns the ksc_ once.
func TestCheckoutSessionStart(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	community := newDefaultVersion(t, "Community", "FREE")
	makePublic(t, community.FamilySlug)
	free := createPrice(t, community.Slug, defaultFlatFee("0", "MONTHLY"))
	pro := newDefaultVersion(t, "Pro", "PAID")
	makePublic(t, pro.FamilySlug)
	proMonthly := createPrice(t, pro.Slug, defaultFlatFee("2900", "MONTHLY"))
	plain := newPublishableKey(t, storefront)
	key := anonymousKey(t)
	order := map[string]any{
		"turnstileToken": "pass:app.acme.test", "priceId": free.ID,
		"email": "Visitor@Example.com", "returnUrl": storefront + "/welcome", "clientReferenceId": "lead-42",
	}

	require.Equal(t, "CreateCheckoutSession.AnonymousCheckoutDisabled", startProblem(t, plain.Key, order, fiber.StatusForbidden).Code)

	for tok, code := range map[string]string{"fail": "CreateCheckoutSession.TurnstileFailed", "pass:evil.example": "CreateCheckoutSession.TurnstileFailed"} {
		require.Equal(t, code, startProblem(t, key.Key, with(order, "turnstileToken", tok), fiber.StatusUnprocessableEntity).Code, tok)
	}
	down := startCheckout(t, key.Key, with(order, "turnstileToken", "down"))
	require.Equal(t, fiber.StatusServiceUnavailable, down.StatusCode)
	require.Equal(t, "30", down.Header.Get("Retry-After"))
	require.Equal(t, "203.0.113.7", turnstileRemoteIP.Load(), "the visitor's address, as the gateway saw it")

	both := with(with(order, "licenseSlug", community.Slug), "billingPeriod", "MONTHLY")
	require.Equal(t, "CreateCheckoutSession.InvalidPriceSelection", startProblem(t, key.Key, both, fiber.StatusUnprocessableEntity).Code)
	require.Equal(t, "CreateCheckoutSession.ProviderCannotCapturePayment",
		startProblem(t, key.Key, with(order, "priceId", proMonthly.ID), fiber.StatusUnprocessableEntity).Code)
	require.Equal(t, "CreateCheckoutSession.InvalidReturnUrl",
		startProblem(t, key.Key, with(order, "returnUrl", "https://evil.example/back"), fiber.StatusUnprocessableEntity).Code)
	require.Equal(t, "CreateCheckoutSession.InvalidEmail",
		startProblem(t, key.Key, with(order, "email", "not-an-address"), fiber.StatusUnprocessableEntity).Code)
	require.Equal(t, "CreateCheckoutSession.VoucherInvalid",
		startProblem(t, key.Key, with(order, "voucherCode", "WELCOME"), fiber.StatusUnprocessableEntity).Code)

	// A preview names the price by its version and period, needs no e-mail,
	// and writes and emits nothing.
	preview := commonfixture.AssertJSONResponse[checkout.CheckoutSessionStart](t, startCheckout(t, key.Key, map[string]any{
		"turnstileToken": "pass:app.acme.test", "licenseSlug": community.Slug, "billingPeriod": "MONTHLY", "dryRun": true,
	}), fiber.StatusOK)
	require.Equal(t, checkout.StartPreview, preview.Status)
	require.Nil(t, preview.SessionID)
	require.Nil(t, preview.Token)
	require.EqualValues(t, 0, preview.DueToday.Total)
	require.False(t, preview.RequiresPaymentMethod, "a FREE plan never needs one")
	require.Zero(t, countCheckoutSessions(t))
	require.Empty(t, outboxPayloads(t, "CHECKOUT_SESSION_STARTED"))

	resp := startCheckout(t, key.Key, order)
	require.Equal(t, "no-store", resp.Header.Get("Cache-Control"))
	opened := commonfixture.AssertJSONResponse[checkout.CheckoutSessionStart](t, resp, fiber.StatusCreated)
	require.Equal(t, checkout.StartOpen, opened.Status)
	require.NotNil(t, opened.SessionID)
	require.True(t, strings.HasPrefix(*opened.Token, "ksc_"))
	require.WithinDuration(t, time.Now().Add(24*time.Hour), *opened.ExpiresAt, time.Minute)
	require.Equal(t, 1, countCheckoutSessions(t), "the session row and nothing else")
	var customers int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM customer`).Scan(&customers))
	require.Zero(t, customers, "no customer before the completion (INV-34)")
	started := outboxPayloads(t, "CHECKOUT_SESSION_STARTED")
	require.Len(t, started, 1)
	require.Equal(t, "Visitor@Example.com", started[0]["email"], "stored as given")
	require.Equal(t, "lead-42", started[0]["clientReferenceId"])
	require.Equal(t, community.Slug, started[0]["licenseSlug"])
	require.Equal(t, "OPEN", started[0]["status"])
	require.Nil(t, started[0]["customerSlug"])
}

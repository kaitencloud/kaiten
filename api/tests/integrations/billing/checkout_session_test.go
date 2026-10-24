package billing_test

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
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

// Each start and confirm comes from a visitor address of its own, so the
// server's per-address limits (§14.3) hold back only the test that is about
// them; lastAddresses is each test's latest.
var (
	lastAddresses sync.Map
	visitors      atomic.Int32
)

func visitorAddress(t *testing.T) string {
	t.Helper()
	n := visitors.Add(1)
	address := fmt.Sprintf("198.18.%d.%d", n/250, n%250+1)
	lastAddresses.Store(t.Name(), address)
	return address
}

func lastAddress(t *testing.T) string {
	t.Helper()
	address, _ := lastAddresses.Load(t.Name())
	return address.(string)
}

// startCheckout posts a start from the storefront, as the gateway forwards it.
func startCheckout(t *testing.T, key string, body map[string]any) *http.Response {
	t.Helper()
	return startCheckoutFrom(t, visitorAddress(t), key, body)
}

func startCheckoutFrom(t *testing.T, address, key string, body map[string]any) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, "POST", checkoutSessionsPath, body)
	req.Header.Set("X-Kaiten-Publishable-Key", key)
	req.Header.Set("Origin", storefront)
	req.Header.Set("X-Envoy-External-Address", address)
	resp, err := testServer.App.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func startProblem(t *testing.T, key string, body map[string]any, status int) kaitenerrors.Problem {
	t.Helper()
	return commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, startCheckout(t, key, body), status)
}

// readCheckout reads a session with a ksc_, from the storefront.
func readCheckout(t *testing.T, sessionID, ksc string) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, "GET", checkoutSessionsPath+"/"+sessionID, nil)
	req.Header.Set("Authorization", "Bearer "+ksc)
	req.Header.Set("Origin", storefront)
	resp, err := testServer.App.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
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
	// A refusal is never cached, and says what it varies on (E-25).
	for _, refused := range []*http.Response{
		startCheckout(t, plain.Key, order),
		startCheckout(t, key.Key, with(order, "turnstileToken", "fail")),
		readCheckout(t, "00000000-0000-0000-0000-000000000000", "ksc_unknown"),
	} {
		require.GreaterOrEqual(t, refused.StatusCode, fiber.StatusBadRequest)
		require.Equal(t, "no-store", refused.Header.Get("Cache-Control"), refused.StatusCode)
		require.Contains(t, refused.Header.Get("Vary"), "Origin", refused.StatusCode)
	}

	for tok, code := range map[string]string{"fail": "CreateCheckoutSession.TurnstileFailed", "pass:evil.example": "CreateCheckoutSession.TurnstileFailed"} {
		require.Equal(t, code, startProblem(t, key.Key, with(order, "turnstileToken", tok), fiber.StatusUnprocessableEntity).Code, tok)
	}
	down := startCheckout(t, key.Key, with(order, "turnstileToken", "down"))
	require.Equal(t, fiber.StatusServiceUnavailable, down.StatusCode)
	require.Equal(t, "30", down.Header.Get("Retry-After"))
	require.Equal(t, lastAddress(t), turnstileRemoteIP.Load(), "the visitor's address, as the gateway saw it")

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

	// The ksc_ reads its own session, and nothing else.
	id := opened.SessionID.String()
	resp = readCheckout(t, id, *opened.Token)
	require.Equal(t, "no-store", resp.Header.Get("Cache-Control"))
	read := commonfixture.AssertJSONResponse[checkout.CheckoutSession](t, resp, fiber.StatusOK)
	require.Equal(t, checkout.StatusOpen, read.Status)
	require.Equal(t, "Visitor@Example.com", read.Email)
	require.Equal(t, community.Slug, read.LicenseSlug)
	require.Equal(t, "MONTHLY", read.BillingPeriod)
	require.Equal(t, free.ID, read.PriceID)
	require.Equal(t, opened.DueToday, read.DueToday, "what the start showed, lines included (E-26)")
	require.Empty(t, read.AddOns)
	require.Nil(t, read.CustomerSlug)
	require.Nil(t, read.CompletedAt)
	require.False(t, read.RequiresPaymentMethod)
	require.Equal(t, fiber.StatusUnauthorized, readCheckout(t, uuid.NewString(), *opened.Token).StatusCode, "another session's id")
	require.Equal(t, fiber.StatusUnauthorized, readCheckout(t, id, "ksc_unknown").StatusCode)
	req := commonfixture.NewJSONRequest(t, "GET", checkoutSessionsPath+"/"+id, nil)
	req.Header.Set("X-Kaiten-Publishable-Key", key.Key)
	wrong, err := testServer.App.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	require.Equal(t, fiber.StatusForbidden, wrong.StatusCode, "a publishable key is the wrong class here")

	// Past its 24 h, an OPEN session reads ABANDONED before the job marks it.
	_, err = testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE checkout_session SET created_at = created_at - interval '25 hours', expires_at = expires_at - interval '25 hours' WHERE id = $1`, id)
	require.NoError(t, err)
	lapsed := commonfixture.AssertJSONResponse[checkout.CheckoutSession](t, readCheckout(t, id, *opened.Token), fiber.StatusOK)
	require.Equal(t, checkout.StatusAbandoned, lapsed.Status)
}

// confirmCheckout confirms a session with its ksc_, from the storefront.
func confirmCheckout(t *testing.T, sessionID, ksc string) *http.Response {
	t.Helper()
	return confirmCheckoutFrom(t, visitorAddress(t), sessionID, ksc)
}

func confirmCheckoutFrom(t *testing.T, address, sessionID, ksc string) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, "POST", checkoutSessionsPath+"/"+sessionID+"/confirm", nil)
	req.Header.Set("Authorization", "Bearer "+ksc)
	req.Header.Set("Origin", storefront)
	req.Header.Set("X-Envoy-External-Address", address)
	resp, err := testServer.App.Test(req, fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

// TestCheckoutSessionRateLimits: a visitor address starts 10 checkouts in 10
// minutes, dryRun included, and confirms 30, whatever the sessions; the next
// is refused 429 .RateLimited with Retry-After, the start before Turnstile,
// and counts nothing. Another address is not held back (§14.3).
func TestCheckoutSessionRateLimits(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	community := newDefaultVersion(t, "Community", "FREE")
	makePublic(t, community.FamilySlug)
	free := createPrice(t, community.Slug, defaultFlatFee("0", "MONTHLY"))
	key := anonymousKey(t)
	draft := func(dryRun bool) map[string]any {
		return map[string]any{
			"turnstileToken": "pass:app.acme.test", "priceId": free.ID, "email": "visitor@example.com",
			"returnUrl": storefront + "/welcome", "dryRun": dryRun,
		}
	}
	const visitor = "198.51.100.10"
	for range 10 {
		commonfixture.AssertJSONResponse[checkout.CheckoutSessionStart](t, startCheckoutFrom(t, visitor, key.Key, draft(true)), fiber.StatusOK)
	}
	sessions := countCheckoutSessions(t)
	limited := startCheckoutFrom(t, visitor, key.Key, map[string]any{"turnstileToken": "fail", "priceId": free.ID, "email": "visitor@example.com"})
	problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, limited, fiber.StatusTooManyRequests)
	require.Equal(t, "CreateCheckoutSession.RateLimited", problem.Code, "refused before Turnstile, which would refuse the token")
	wait, err := strconv.Atoi(limited.Header.Get("Retry-After"))
	require.NoError(t, err)
	require.Positive(t, wait)
	require.Equal(t, sessions, countCheckoutSessions(t))
	commonfixture.AssertJSONResponse[checkout.CheckoutSessionStart](t,
		startCheckout(t, key.Key, draft(true)), fiber.StatusOK)

	// Three sessions, ten confirms each, under each ksc_'s own limit.
	var last checkout.CheckoutSessionStart
	for range 3 {
		last = commonfixture.AssertJSONResponse[checkout.CheckoutSessionStart](t, startCheckout(t, key.Key, draft(false)), fiber.StatusCreated)
		id := last.SessionID.String()
		done := commonfixture.AssertJSONResponse[checkout.CheckoutConfirmation](t, confirmCheckoutFrom(t, visitor, id, *last.Token), fiber.StatusOK)
		require.Equal(t, checkout.ConfirmCompleted, done.Status)
		for range 9 {
			closed := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, confirmCheckoutFrom(t, visitor, id, *last.Token), fiber.StatusConflict)
			require.Equal(t, "ConfirmCheckoutSession.SessionClosed", closed.Code)
		}
	}
	// The bucket gives a confirm back every 20 seconds: a slow runner may be
	// handed one or two before the 31st, never many.
	limited = nil
	for range 3 {
		resp := confirmCheckoutFrom(t, visitor, last.SessionID.String(), *last.Token)
		if resp.StatusCode == fiber.StatusTooManyRequests {
			limited = resp
			break
		}
		closed := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusConflict)
		require.Equal(t, "ConfirmCheckoutSession.SessionClosed", closed.Code)
	}
	require.NotNil(t, limited, "the confirms past 30 from one address are refused")
	problem = commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, limited, fiber.StatusTooManyRequests)
	require.Equal(t, "ConfirmCheckoutSession.RateLimited", problem.Code)
	require.NotEmpty(t, limited.Header.Get("Retry-After"))
}

// TestCheckoutSessionFreePlan: an anonymous checkout of a FREE plan
// completes at its first confirm, with no provider at all: one transaction
// creates the customer, the instance on the plan's version and a NOOP
// subscription, and closes the session COMPLETED (§9.12 rule 8).
func TestCheckoutSessionFreePlan(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	community := newDefaultVersion(t, "Community", "FREE")
	makePublic(t, community.FamilySlug)
	free := createPrice(t, community.Slug, defaultFlatFee("0", "MONTHLY"))
	key := anonymousKey(t)
	opened := commonfixture.AssertJSONResponse[checkout.CheckoutSessionStart](t, startCheckout(t, key.Key, map[string]any{
		"turnstileToken": "pass:app.acme.test", "priceId": free.ID, "email": "visitor@example.com",
		"returnUrl": storefront + "/welcome", "clientReferenceId": "lead-7",
	}), fiber.StatusCreated)
	id := opened.SessionID.String()

	resp := confirmCheckout(t, id, *opened.Token)
	require.Equal(t, "no-store", resp.Header.Get("Cache-Control"))
	done := commonfixture.AssertJSONResponse[checkout.CheckoutConfirmation](t, resp, fiber.StatusOK)
	require.Equal(t, checkout.ConfirmCompleted, done.Status)
	require.Nil(t, done.SetupURL)
	require.Equal(t, checkout.StatusCompleted, done.Session.Status)
	require.NotNil(t, done.Session.CustomerSlug)
	require.NotNil(t, done.Session.InstanceSlug)
	require.NotNil(t, done.Session.CompletedAt)

	customer := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", "/api/customers/"+*done.Session.CustomerSlug, nil), fiber.StatusOK)
	require.Equal(t, "visitor@example.com", customer["billingEmail"], "the e-mail becomes the billing e-mail at completion")
	instance := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", "/api/instances/"+*done.Session.InstanceSlug, nil), fiber.StatusOK)
	require.Equal(t, community.ID.String(), instance["licenseId"], "nothing due: the plan's own version")
	billing := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", "/api/instances/"+*done.Session.InstanceSlug+"/billing", nil), fiber.StatusOK)
	require.Equal(t, "ACTIVE", billing["status"])
	require.Equal(t, "NOOP", billing["providerKind"], "a FREE plan bills through no provider")

	completed := outboxPayloads(t, "CHECKOUT_SESSION_COMPLETED")
	require.Len(t, completed, 1)
	require.Equal(t, *done.Session.CustomerSlug, completed[0]["customerSlug"])
	require.Equal(t, *done.Session.InstanceSlug, completed[0]["instanceSlug"])
	require.Equal(t, "lead-7", completed[0]["clientReferenceId"])
	require.Equal(t, "COMPLETED", completed[0]["status"])

	again := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, confirmCheckout(t, id, *opened.Token), fiber.StatusConflict)
	require.Equal(t, "ConfirmCheckoutSession.SessionClosed", again.Code)
	require.Equal(t, "COMPLETED", again.Errors[0].Value.(map[string]any)["status"])
	read := commonfixture.AssertJSONResponse[checkout.CheckoutSession](t, readCheckout(t, id, *opened.Token), fiber.StatusOK)
	require.Equal(t, checkout.StatusCompleted, read.Status, "the ksc_ still reads it after it closed")
	require.Len(t, outboxPayloads(t, "CHECKOUT_SESSION_COMPLETED"), 1, "completed once")
}

// TestCheckoutSessionVendorReads: the vendor reads its anonymous checkouts
// (§13.18): newest first, filtered by status (an OPEN one past its expiry is
// ABANDONED), normalized e-mail and clientReferenceId; never a ksc_.
func TestCheckoutSessionVendorReads(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	community := newDefaultVersion(t, "Community", "FREE")
	makePublic(t, community.FamilySlug)
	free := createPrice(t, community.Slug, defaultFlatFee("0", "MONTHLY"))
	key := anonymousKey(t)
	start := func(email, reference string) checkout.CheckoutSessionStart {
		t.Helper()
		return commonfixture.AssertJSONResponse[checkout.CheckoutSessionStart](t, startCheckout(t, key.Key, map[string]any{
			"turnstileToken": "pass:app.acme.test", "priceId": free.ID, "email": email,
			"returnUrl": storefront + "/welcome", "clientReferenceId": reference,
		}), fiber.StatusCreated)
	}
	completed := start("Ada@Example.com", "lead-1")
	require.Equal(t, fiber.StatusOK, confirmCheckout(t, completed.SessionID.String(), *completed.Token).StatusCode)
	open := start("grace@example.com", "lead-2")
	lapsed := start("linus@example.com", "lead-3")
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE checkout_session SET created_at = created_at - interval '25 hours', expires_at = expires_at - interval '25 hours' WHERE id = $1`, lapsed.SessionID)
	require.NoError(t, err)

	list := func(query string) []checkout.CheckoutSessionAdmin {
		t.Helper()
		resp := call(t, "GET", "/api/checkout-sessions"+query, nil)
		raw, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Equal(t, fiber.StatusOK, resp.StatusCode, string(raw))
		require.NotContains(t, string(raw), "ksc_", "never the token")
		var page pagination.Page[checkout.CheckoutSessionAdmin]
		require.NoError(t, json.Unmarshal(raw, &page))
		return page.Items
	}
	all := list("")
	require.Len(t, all, 3)
	require.Equal(t, open.SessionID.String(), all[0].SessionID.String(), "newest first")
	require.Equal(t, lapsed.SessionID.String(), all[2].SessionID.String(), "the backdated one last")

	done := list("?status=COMPLETED")
	require.Len(t, done, 1)
	require.Equal(t, completed.SessionID.String(), done[0].SessionID.String())
	require.NotNil(t, done[0].CustomerSlug, "the completion's customer")
	require.NotNil(t, done[0].ClosedAt)
	abandoned := list("?status=ABANDONED")
	require.Len(t, abandoned, 1, "OPEN past its expiry reads ABANDONED")
	require.Equal(t, lapsed.SessionID.String(), abandoned[0].SessionID.String())
	require.Len(t, list("?status=OPEN&status=ABANDONED"), 2)
	require.Len(t, list("?email=ADA@example.COM"), 1, "the e-mail in any letter case")
	require.Len(t, list("?clientReferenceId=lead-2"), 1)

	one := commonfixture.AssertJSONResponse[checkout.CheckoutSessionAdmin](t,
		call(t, "GET", "/api/checkout-sessions/"+open.SessionID.String(), nil), fiber.StatusOK)
	require.Equal(t, "grace@example.com", one.Email)
	require.Equal(t, checkout.StatusOpen, one.Status)
	require.Nil(t, one.ClosedAt)
	require.Equal(t, "GetCheckoutSessionAdmin.NotFound", problemCode(t, fiber.StatusNotFound, "GET", "/api/checkout-sessions/"+uuid.NewString(), nil))
}

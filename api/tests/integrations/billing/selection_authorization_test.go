package billing_test

import (
	"context"
	"errors"
	"maps"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// Reject real licensing reads made with a transaction-bound context. Unlike a
// warm cache test this catches nested independent module gates under row locks.
type lockRejectingEntitlements struct {
	mu          sync.Mutex
	lockedCalls int
	calls       map[string]int
}

func (p *lockRejectingEntitlements) Entitled(ctx context.Context, _ uuid.UUID, slug string) (bool, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls[slug]++
	if uow.InTransaction(ctx) {
		p.lockedCalls++
		return false, errors.New("licensing read while checkout consistency locks are held")
	}
	return true, nil
}

func uncachedCheckoutServer(t *testing.T) *lockRejectingEntitlements {
	t.Helper()
	turnstile := httptest.NewServer(http.HandlerFunc(fakeTurnstile))
	t.Cleanup(turnstile.Close)
	plans := &lockRejectingEntitlements{calls: map[string]int{}}
	previous := testServer
	server := tests.NewTestServer(testDb, tests.TestServerOptions{
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			cfg.Billing.EntitlementCacheTTL = 0
			cfg.Billing.PeriodClose.Interval = -1
			cfg.Billing.Push.Interval = -1
			cfg.Billing.Lifecycle.Interval = -1
			cfg.Billing.Sync.Interval = -1
		},
		ConnectorEntitlements: plans,
		TurnstileVerifyURL:    turnstile.URL,
	})
	testServer = server
	t.Cleanup(func() {
		require.NoError(t, server.Close())
		testServer = previous
		require.NoError(t, testDb.Reset())
	})
	return plans
}

func TestSubscriptionSelectionChecksOnceWithoutLicensingUnderLocks(t *testing.T) {
	plans := uncachedCheckoutServer(t)
	sold := newSold(t, flatFee("0", "MONTHLY"))
	addon := newAddon(t, map[string]any{"name": "Extra", "pricingType": "FREE", "isDefault": true})
	fits(t, addon.Slug, sold.version.Slug)
	voucher := newVoucher(t, percentOff("10", map[string]any{"code": "ONCE-ONLY", "maxRedemptions": 1}))
	publish(t, voucher)
	plans.mu.Lock()
	clear(plans.calls)
	plans.mu.Unlock()
	started := subscribe(t, sold.instance.Slug, map[string]any{
		"basePriceId": sold.monthly.ID, "voucherCode": "ONCE-ONLY",
		"addOns": []map[string]any{{"addonSlug": addon.Slug, "quantity": 2}},
	})
	require.Equal(t, "ACTIVE", started.Status)
	plans.mu.Lock()
	lockedCalls, calls := plans.lockedCalls, maps.Clone(plans.calls)
	plans.mu.Unlock()
	require.Zero(t, lockedCalls)
	for _, slug := range []string{dogfooding.BillingEntitlementSlug, dogfooding.AddonsEntitlementSlug, dogfooding.VouchersEntitlementSlug} {
		require.Equal(t, 1, calls[slug], slug)
	}
}

func TestConcurrentAnonymousCompletionConsumesVoucherOnceWithoutLicensingUnderLocks(t *testing.T) {
	plans := uncachedCheckoutServer(t)
	community := newDefaultVersion(t, "Community", "FREE")
	makePublic(t, community.FamilySlug)
	free := createPrice(t, community.Slug, defaultFlatFee("0", "MONTHLY"))
	newEntitlement(t, "seats", 0)
	grant(t, community.Slug, "seats", 3, 0)
	voucher := newVoucher(t, map[string]any{
		"name": "Once", "code": "ONCE-ONLY", "voucherType": "ENTITLEMENT_BOOST", "maxRedemptions": 1,
		"grants": []map[string]any{{"entitlementSlug": "seats", "modifierType": "ADD", "modifierValue": "5"}},
	})
	publish(t, voucher)
	key := anonymousKey(t)
	opened := commonfixture.AssertJSONResponse[checkout.CheckoutSessionStart](t, startCheckout(t, key.Key, map[string]any{
		"turnstileToken": "pass:app.acme.test", "priceId": free.ID, "email": "visitor@example.com",
		"returnUrl": storefront + "/welcome", "voucherCode": "ONCE-ONLY",
	}), fiber.StatusCreated)
	statuses := make(chan int, 2)
	var waiting sync.WaitGroup
	for range 2 {
		waiting.Go(func() {
			response := confirmCheckout(t, opened.SessionID.String(), *opened.Token)
			statuses <- response.StatusCode
		})
	}
	waiting.Wait()
	close(statuses)
	for status := range statuses {
		require.Contains(t, []int{fiber.StatusOK, fiber.StatusConflict}, status)
	}
	require.Len(t, outboxPayloads(t, "CHECKOUT_SESSION_COMPLETED"), 1)
	var redemptions int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		"SELECT count(*) FROM instance_voucher WHERE voucher_id = $1", voucher.ID).Scan(&redemptions))
	require.Equal(t, 1, redemptions)
	plans.mu.Lock()
	lockedCalls := plans.lockedCalls
	plans.mu.Unlock()
	require.Zero(t, lockedCalls)
}

func TestNestedSubscriptionWithoutPreauthorizationDoesNotReadLicensing(t *testing.T) {
	plans := &lockRejectingEntitlements{calls: map[string]int{}}
	g := gate.New(true, plans)
	uof := uow.NewUnitOfWork(testDb.DbPool)
	err := uof.Transact(t.Context(), func(ctx context.Context) error {
		require.Equal(t, gate.CodeEntitlementCheckUnavailable, apierrors.GetCode(g.Require(ctx, testDb.DefaultData.OrganizationID)))
		require.Equal(t, gate.CodeEntitlementCheckUnavailable, apierrors.GetCode(g.RequireEntitlement(ctx, testDb.DefaultData.OrganizationID, dogfooding.AddonsEntitlementSlug, "Addons")))
		require.Equal(t, gate.CodeEntitlementCheckUnavailable, apierrors.GetCode(g.RequireEntitlement(ctx, testDb.DefaultData.OrganizationID, dogfooding.VouchersEntitlementSlug, "Vouchers")))
		_, err := g.BeginSelection(ctx, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID,
			gate.Selection{InstanceSlug: "instance", BasePriceID: uuid.New()})
		return err
	})
	require.Equal(t, gate.CodeEntitlementCheckUnavailable, apierrors.GetCode(err))
	require.Empty(t, plans.calls, "a missing proof must fail before contacting licensing inside a transaction")
}

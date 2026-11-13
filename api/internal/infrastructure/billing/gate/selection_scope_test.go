package gate

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

type selectionPlans struct {
	mu      sync.Mutex
	allowed map[string]bool
	asks    []string
}

func (p *selectionPlans) Entitled(_ context.Context, _ uuid.UUID, slug string) (bool, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.asks = append(p.asks, slug)
	return p.allowed[slug], nil
}

func (p *selectionPlans) asked() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]string(nil), p.asks...)
}

func grantedSelectionPlans() *selectionPlans {
	return &selectionPlans{allowed: map[string]bool{
		dogfooding.BillingEntitlementSlug:  true,
		dogfooding.VouchersEntitlementSlug: true,
		dogfooding.AddonsEntitlementSlug:   true,
	}}
}

func selectedPurchase() Selection {
	code := "PROMO"
	return Selection{InstanceSlug: "instance", BasePriceID: uuid.New(), VoucherCode: &code, AddOns: []SelectionAddon{{Slug: "extra", Quantity: 1}}}
}

func TestSelectionScopeChecksOnceAcrossIndependentGatesWithoutProcessCache(t *testing.T) {
	plans := grantedSelectionPlans()
	g, nested := New(true, plans), New(true, plans)
	org := uuid.New()
	actor, purchase := uuid.New(), selectedPurchase()
	scope, err := g.BeginSelection(t.Context(), org, actor, purchase)
	require.NoError(t, err)
	defer scope.Close()
	// A later plan answer cannot contradict the decision inside this attempt.
	plans.allowed[dogfooding.VouchersEntitlementSlug] = false
	require.NoError(t, nested.RequireSelection(scope.Context(), org, true, true))
	require.NoError(t, nested.RequireEntitlement(scope.Context(), org, dogfooding.AddonsEntitlementSlug, "Addons"))
	require.NoError(t, nested.RequireEntitlement(scope.Context(), org, dogfooding.VouchersEntitlementSlug, "Vouchers"))
	require.Equal(t, []string{dogfooding.BillingEntitlementSlug, dogfooding.VouchersEntitlementSlug, dogfooding.AddonsEntitlementSlug}, plans.asked())
	// A new attempt still checks the current plan, even while the first exists.
	_, err = g.BeginSelection(t.Context(), org, actor, purchase)
	require.Equal(t, "Vouchers.NotEntitled", apierrors.GetCode(err))
}

func TestSelectionScopeFailsClosedOnWrongTenantAuthorityOrUnselectedCapability(t *testing.T) {
	plans := grantedSelectionPlans()
	g := New(true, plans)
	org := uuid.New()
	actor, purchase := uuid.New(), selectedPurchase()
	purchase.VoucherCode, purchase.AddOns = nil, nil
	scope, err := g.BeginSelection(t.Context(), org, actor, purchase)
	require.NoError(t, err)
	defer scope.Close()
	require.Equal(t, CodeEntitlementCheckUnavailable, apierrors.GetCode(g.Require(scope.Context(), uuid.New())))
	other := grantedSelectionPlans()
	require.Equal(t, CodeEntitlementCheckUnavailable, apierrors.GetCode(New(true, other).Require(scope.Context(), org)))
	require.Empty(t, other.asked(), "a foreign authority was contacted using another authority's scope")
	require.Equal(t, "Addons.EntitlementCheckUnavailable", apierrors.GetCode(g.RequireEntitlement(scope.Context(), org, dogfooding.AddonsEntitlementSlug, "Addons")))
	require.Equal(t, "Vouchers.EntitlementCheckUnavailable", apierrors.GetCode(g.RequireEntitlement(scope.Context(), org, dogfooding.VouchersEntitlementSlug, "Vouchers")))
	require.Equal(t, CodeDisabled, apierrors.GetCode(New(false, plans).Require(scope.Context(), org)))
	require.Equal(t, []string{dogfooding.BillingEntitlementSlug}, plans.asked())
}

func TestNestedSelectionScopeCannotCloseOrExpandItsParent(t *testing.T) {
	plans := grantedSelectionPlans()
	g := New(true, plans)
	org := uuid.New()
	actor, purchase := uuid.New(), selectedPurchase()
	purchase.VoucherCode = nil
	scope, err := g.BeginSelection(t.Context(), org, actor, purchase)
	require.NoError(t, err)
	defer scope.Close()
	joined, err := New(true, plans).BeginSelection(scope.Context(), org, actor, purchase)
	require.NoError(t, err)
	joined.Close()
	require.NoError(t, g.RequireSelection(scope.Context(), org, false, true))
	purchase.VoucherCode = new("OTHER")
	_, err = g.BeginSelection(scope.Context(), org, actor, purchase)
	require.Equal(t, CodeEntitlementCheckUnavailable, apierrors.GetCode(err))
	require.Equal(t, []string{dogfooding.BillingEntitlementSlug, dogfooding.AddonsEntitlementSlug}, plans.asked())
	scope.Close()
	require.Equal(t, CodeEntitlementCheckUnavailable, apierrors.GetCode(g.Require(scope.Context(), org)))
	require.Equal(t, []string{dogfooding.BillingEntitlementSlug, dogfooding.AddonsEntitlementSlug}, plans.asked())
}

func TestSelectionScopeDoesNotSurviveRequestCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	plans := grantedSelectionPlans()
	g := New(true, plans)
	org := uuid.New()
	scope, err := g.BeginSelection(ctx, org, uuid.New(), selectedPurchase())
	require.NoError(t, err)
	defer scope.Close()
	cancel()
	require.Equal(t, CodeEntitlementCheckUnavailable, apierrors.GetCode(g.Require(context.WithoutCancel(scope.Context()), org)))
	require.Len(t, plans.asked(), 3)
}

type (
	lockedSelectionKey struct{}
	lockSensitivePlans struct{ calls []string }
)

func (p *lockSensitivePlans) Entitled(ctx context.Context, _ uuid.UUID, slug string) (bool, error) {
	p.calls = append(p.calls, slug)
	if ctx.Value(lockedSelectionKey{}) != nil {
		return false, errors.New("licensing reached while transaction locks are held")
	}
	return true, nil
}

func TestDerivedTransactionContextDoesNotReachLicensing(t *testing.T) {
	plans := &lockSensitivePlans{}
	g := New(true, plans)
	org := uuid.New()
	actor, purchase := uuid.New(), selectedPurchase()
	scope, err := g.BeginSelection(t.Context(), org, actor, purchase)
	require.NoError(t, err)
	defer scope.Close()
	// UOW derives its context the same way; its private transaction key is irrelevant.
	locked := context.WithValue(scope.Context(), lockedSelectionKey{}, true)
	for range 5 {
		require.NoError(t, New(true, plans).RequireSelection(locked, org, true, true))
	}
	require.Len(t, plans.calls, 3)
}

func TestIndependentSelectionAttemptsDoNotShareDecisions(t *testing.T) {
	plans := grantedSelectionPlans()
	g := New(true, plans)
	org, actor, purchase := uuid.New(), uuid.New(), selectedPurchase()
	var waiting sync.WaitGroup
	for range 20 {
		waiting.Go(func() {
			scope, err := g.BeginSelection(t.Context(), org, actor, purchase)
			if err != nil {
				t.Error(err)
				return
			}
			defer scope.Close()
			if err := g.RequireSelection(scope.Context(), org, true, true); err != nil {
				t.Error(err)
			}
		})
	}
	waiting.Wait()
	require.Len(t, plans.asked(), 60, "an attempt leaked its decision into another request")
}

func TestSelectionScopeRejectsPurchaseAndActorDriftWithoutReadingAuthority(t *testing.T) {
	plans := grantedSelectionPlans()
	g := New(true, plans)
	org, actor, purchase := uuid.New(), uuid.New(), selectedPurchase()
	scope, err := g.BeginSelection(t.Context(), org, actor, purchase)
	require.NoError(t, err)
	defer scope.Close()
	for _, mutate := range []func(*Selection){
		func(s *Selection) { s.InstanceSlug = "another" },
		func(s *Selection) { s.BasePriceID = uuid.New() },
		func(s *Selection) { s.VoucherCode = new("OTHER") },
		func(s *Selection) { s.AddOns = []SelectionAddon{{Slug: "extra", Quantity: 2}} },
		func(s *Selection) { s.AddOns = []SelectionAddon{{Slug: "other", Quantity: 1}} },
	} {
		changed := copySelection(purchase)
		mutate(&changed)
		_, err := g.BeginSelection(scope.Context(), org, actor, changed)
		require.Equal(t, CodeEntitlementCheckUnavailable, apierrors.GetCode(err))
	}
	_, err = g.BeginSelection(scope.Context(), org, uuid.New(), purchase)
	require.Equal(t, CodeEntitlementCheckUnavailable, apierrors.GetCode(err))
	require.NoError(t, g.RequireSelectedAddon(scope.Context(), org, actor, "instance", "extra", 0))
	require.NoError(t, g.RequireSelectedVoucher(scope.Context(), org, actor, "instance", "PROMO"))
	require.Error(t, g.RequireSelectedAddon(scope.Context(), org, actor, "other-instance", "extra", 1))
	require.Error(t, g.RequireSelectedAddon(scope.Context(), org, actor, "instance", "extra", 2))
	require.Error(t, g.RequireSelectedVoucher(scope.Context(), org, actor, "instance", "OTHER"))
	require.Error(t, g.RequireSelectedVoucher(scope.Context(), org, uuid.New(), "instance", "PROMO"))
	require.Len(t, plans.asked(), 3)
}

func TestSelectionScopeCopiesInputsAndExpiresFailClosed(t *testing.T) {
	plans := grantedSelectionPlans()
	g := New(true, plans)
	org, actor, purchase := uuid.New(), uuid.New(), selectedPurchase()
	scope, err := g.BeginSelection(t.Context(), org, actor, purchase)
	require.NoError(t, err)
	defer scope.Close()
	*purchase.VoucherCode = "CHANGED"
	purchase.AddOns[0].Quantity = 4
	require.NoError(t, g.RequireSelectedVoucher(scope.Context(), org, actor, "instance", "PROMO"))
	require.NoError(t, g.RequireSelectedAddon(scope.Context(), org, actor, "instance", "extra", 1))
	scope.decision.expiresAt = time.Now().Add(-time.Second)
	require.Error(t, scope.Validate(scope.Context()))
	require.Equal(t, CodeEntitlementCheckUnavailable, apierrors.GetCode(g.Require(scope.Context(), org)))
	require.Len(t, plans.asked(), 3)
}

func TestAnonymousScopeBindsExactlyOneNewInstance(t *testing.T) {
	plans := grantedSelectionPlans()
	g := New(true, plans)
	org, actor, purchase := uuid.New(), uuid.New(), selectedPurchase()
	purchase.InstanceSlug, purchase.CheckoutSessionID = "", uuid.New()
	scope, err := g.BeginSelection(t.Context(), org, actor, purchase)
	require.NoError(t, err)
	defer scope.Close()
	locked := context.WithValue(scope.Context(), lockedSelectionKey{}, true)
	bound, err := scope.BindInstance(locked, "created-instance")
	require.NoError(t, err)
	require.Equal(t, true, bound.Value(lockedSelectionKey{}))
	purchase.InstanceSlug, purchase.CheckoutSessionID = "created-instance", uuid.Nil
	joined, err := New(true, plans).BeginSelection(bound, org, actor, purchase)
	require.NoError(t, err)
	joined.Close()
	require.NoError(t, g.RequireSelectedAddon(bound, org, actor, "created-instance", "extra", 1))
	require.Error(t, g.RequireSelectedAddon(bound, org, actor, "another-instance", "extra", 1))
	_, err = scope.BindInstance(locked, "another-instance")
	require.Error(t, err)
	scope.Close()
	require.Error(t, g.Require(bound, org))
	require.Len(t, plans.asked(), 3)
}

func TestFreshSelectionDoesNotUseCachedPositiveFallbackDuringOutage(t *testing.T) {
	plans := &countingEntitlements{entitled: true}
	g := NewCached(true, plans, time.Minute)
	org, actor, purchase := uuid.New(), uuid.New(), selectedPurchase()
	require.NoError(t, g.RequireSelection(t.Context(), org, true, true))
	plans.err = errors.New("licensing outage")
	_, err := g.BeginSelection(t.Context(), org, actor, purchase)
	require.Equal(t, CodeEntitlementCheckUnavailable, apierrors.GetCode(err))
	require.Equal(t, 4, plans.calls, "completion must read the authority, not reuse cached grants")
}

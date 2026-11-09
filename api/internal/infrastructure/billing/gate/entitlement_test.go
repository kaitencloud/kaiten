package gate

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

type capabilityEntitlements struct {
	grants   map[string]bool
	failures map[string]error
	asks     []string
}

func (c *capabilityEntitlements) Entitled(_ context.Context, _ uuid.UUID, slug string) (bool, error) {
	c.asks = append(c.asks, slug)
	return c.grants[slug], c.failures[slug]
}

func TestRequireEntitlement(t *testing.T) {
	for _, feature := range []struct{ slug, namespace string }{
		{dogfooding.VouchersEntitlementSlug, "Vouchers"},
		{dogfooding.AddonsEntitlementSlug, "Addons"},
	} {
		t.Run(feature.slug, func(t *testing.T) {
			source := &capabilityEntitlements{grants: map[string]bool{dogfooding.BillingEntitlementSlug: true}, failures: map[string]error{}}
			g := New(true, source)
			org := uuid.New()
			require.Equal(t, feature.namespace+".NotEntitled", apierrors.GetCode(g.RequireEntitlement(t.Context(), org, feature.slug, feature.namespace)))
			require.Equal(t, []string{dogfooding.BillingEntitlementSlug, feature.slug}, source.asks)
			source.grants[feature.slug] = true
			require.NoError(t, g.RequireEntitlement(t.Context(), org, feature.slug, feature.namespace))
			source.failures[feature.slug] = errors.New("KbK unavailable")
			require.Equal(t, feature.namespace+".EntitlementCheckUnavailable", apierrors.GetCode(g.RequireEntitlement(t.Context(), org, feature.slug, feature.namespace)))
			require.False(t, g.GrantedEntitlement(t.Context(), org, feature.slug))
			require.NoError(t, New(true, nil).RequireEntitlement(t.Context(), org, feature.slug, feature.namespace), "self-hosted is always entitled")
			require.Equal(t, CodeDisabled, apierrors.GetCode(New(false, source).RequireEntitlement(t.Context(), org, feature.slug, feature.namespace)))
			source.grants[dogfooding.BillingEntitlementSlug] = false
			require.Equal(t, CodeNotEntitled, apierrors.GetCode(g.RequireEntitlement(t.Context(), org, feature.slug, feature.namespace)), "billing refusal takes precedence")
		})
	}
}

func TestCapabilityCacheSeparatesSlugsAndOrganizations(t *testing.T) {
	org := uuid.New()
	now := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	source := &capabilityEntitlements{grants: map[string]bool{
		dogfooding.BillingEntitlementSlug: true, dogfooding.VouchersEntitlementSlug: false, dogfooding.AddonsEntitlementSlug: true,
	}, failures: map[string]error{}}
	g := NewCached(true, source, time.Minute)
	g.answers.now = func() time.Time { return now }
	require.NoError(t, g.Require(t.Context(), org))
	require.Equal(t, "Vouchers.NotEntitled", apierrors.GetCode(g.RequireEntitlement(t.Context(), org, dogfooding.VouchersEntitlementSlug, "Vouchers")))
	require.NoError(t, g.RequireEntitlement(t.Context(), org, dogfooding.AddonsEntitlementSlug, "Addons"))
	require.Equal(t, []string{dogfooding.BillingEntitlementSlug, dogfooding.VouchersEntitlementSlug, dogfooding.AddonsEntitlementSlug}, source.asks)
	source.grants[dogfooding.AddonsEntitlementSlug] = false
	require.True(t, g.GrantedEntitlement(t.Context(), org, dogfooding.AddonsEntitlementSlug), "fresh answer is trusted")
	require.False(t, g.GrantedEntitlement(t.Context(), uuid.New(), dogfooding.AddonsEntitlementSlug), "another organization has its own answer")
	now = now.Add(2 * time.Minute)
	source.failures[dogfooding.AddonsEntitlementSlug] = errors.New("KbK unavailable")
	require.True(t, g.GrantedEntitlement(t.Context(), org, dogfooding.AddonsEntitlementSlug), "last known grant survives an outage")
	require.NoError(t, g.RequireEntitlement(t.Context(), org, dogfooding.AddonsEntitlementSlug, "Addons"))
	now = now.Add(25 * time.Minute)
	require.False(t, g.GrantedEntitlement(t.Context(), org, dogfooding.AddonsEntitlementSlug), "expired stale answer is not a grant")
	require.Equal(t, "Addons.EntitlementCheckUnavailable", apierrors.GetCode(g.RequireEntitlement(t.Context(), org, dogfooding.AddonsEntitlementSlug, "Addons")))
}

package checkout_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func refusal(t *testing.T, err error) *kaitenerrors.Error {
	t.Helper()
	var problem *kaitenerrors.Error
	require.True(t, errors.As(err, &problem), "%v", err)
	return problem
}

// TestLimitsBoundEachKey: a key's calls are bounded whatever address they come
// from, and when the gateway reports none; another key is not held back.
func TestLimitsBoundEachKey(t *testing.T) {
	limits := checkout.StartLimits(config.BillingCheckoutLimits{PerKeyPerHour: 3})
	key, other := uuid.New(), uuid.New()
	ctx := context.Background()
	require.NoError(t, limits.Take(ctx, "CreateCheckoutSession", key, "198.51.100.1"))
	require.NoError(t, limits.Take(ctx, "CreateCheckoutSession", key, "198.51.100.2"))
	require.NoError(t, limits.Take(ctx, "CreateCheckoutSession", key, ""))
	refused := refusal(t, limits.Take(ctx, "CreateCheckoutSession", key, "198.51.100.3"))
	require.Equal(t, "CreateCheckoutSession.RateLimited", refused.Code)
	require.Equal(t, 429, refused.HTTPStatus())
	require.NoError(t, limits.Take(ctx, "CreateCheckoutSession", other, "198.51.100.3"), "the refusal took nothing from the address")
}

// TestLimitsBoundEachAddress: the start's two address buckets, 10 per 10
// minutes and 30 an hour by default; the confirm's own, apart.
func TestLimitsBoundEachAddress(t *testing.T) {
	ctx := context.Background()
	starts := checkout.StartLimits(config.BillingCheckoutLimits{})
	for range 10 {
		require.NoError(t, starts.Take(ctx, "CreateCheckoutSession", uuid.New(), "198.51.100.1"))
	}
	require.Error(t, starts.Take(ctx, "CreateCheckoutSession", uuid.New(), "198.51.100.1"))

	hourly := checkout.StartLimits(config.BillingCheckoutLimits{StartsPerAddressPer10m: 100, StartsPerAddressPerHour: 2})
	require.NoError(t, hourly.Take(ctx, "CreateCheckoutSession", uuid.New(), "198.51.100.1"))
	require.NoError(t, hourly.Take(ctx, "CreateCheckoutSession", uuid.New(), "198.51.100.1"))
	require.Error(t, hourly.Take(ctx, "CreateCheckoutSession", uuid.New(), "198.51.100.1"))

	confirms := checkout.ConfirmLimits(config.BillingCheckoutLimits{})
	for range 30 {
		require.NoError(t, confirms.Take(ctx, "ConfirmCheckoutSession", uuid.New(), "198.51.100.1"))
	}
	require.Equal(t, "ConfirmCheckoutSession.RateLimited", refusal(t, confirms.Take(ctx, "ConfirmCheckoutSession", uuid.New(), "198.51.100.1")).Code)
}

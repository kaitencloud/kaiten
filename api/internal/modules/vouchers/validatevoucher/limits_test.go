package validatevoucher

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func rateLimitedAfter(t *testing.T, err error) time.Duration {
	t.Helper()
	var refusal *kaitenerrors.Error
	require.True(t, errors.As(err, &refusal), "a typed refusal: %v", err)
	require.Equal(t, "ValidateVoucher.RateLimited", refusal.Code)
	require.Equal(t, kaitenerrors.KindTooManyRequests, refusal.Kind)
	return refusal.RetryAfter
}

// §11.2 rule 5: the vendor's backend checks 60 codes a minute per principal.
func TestAPrincipalChecksSixtyCodesAMinute(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	u := NewUseCase(catalogue.Deps{})
	u.now = func() time.Time { return now }
	org, user := uuid.New(), uuid.New()

	for i := range 60 {
		require.NoError(t, u.limitPrincipal(ctx, org, user), "check %d", i)
	}
	require.Equal(t, time.Second, rateLimitedAfter(t, u.limitPrincipal(ctx, org, user)), "one more a second")
	require.NoError(t, u.limitPrincipal(ctx, org, uuid.New()), "another principal has its own budget")
	require.NoError(t, u.limitPrincipal(ctx, uuid.New(), user), "and so does the same user in another organization")

	now = now.Add(time.Second)
	require.NoError(t, u.limitPrincipal(ctx, org, user))
}

// §14.3: a session checks 10 codes per 10 minutes, and its customer 30 an
// hour whatever the number of sessions it mints; a check one limit refuses
// spends nothing of the other.
func TestASessionAndItsCustomerAreBothLimited(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	u := NewUseCase(catalogue.Deps{})
	u.now = func() time.Time { return now }
	customer := uuid.New()

	first := uuid.New()
	for i := range 10 {
		require.NoError(t, u.limitSession(ctx, first, customer), "check %d", i)
	}
	require.Equal(t, time.Minute, rateLimitedAfter(t, u.limitSession(ctx, first, customer)))

	for range 2 {
		session := uuid.New()
		for i := range 10 {
			require.NoError(t, u.limitSession(ctx, session, customer), "check %d", i)
		}
	}
	require.Equal(t, 2*time.Minute, rateLimitedAfter(t, u.limitSession(ctx, uuid.New(), customer)),
		"30 an hour for the customer: the refused 11th check of the first session spent none of them")
	require.NoError(t, u.limitSession(ctx, uuid.New(), uuid.New()), "another customer has its own budget")
}

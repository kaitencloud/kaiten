package billing_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/expiry"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// §11.5, §16.2 (b): billing-lifecycle marks EXPIRED the vouchers past their
// expiresAt and the boosts past their window, once each, with their events.
func TestVoucherExpiry(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	newEntitlement(t, "seats", 0)
	s := newSold(t, flatFee("2900", "MONTHLY"))
	grant(t, s.version.Slug, "seats", 10, 0)

	ending := newVoucher(t, percentOff("10", map[string]any{"name": "Spring"}))
	publish(t, ending)
	lasting := newVoucher(t, percentOff("10", map[string]any{"name": "Forever"}))
	publish(t, lasting)
	boost := newVoucher(t, map[string]any{
		"voucherType": "ENTITLEMENT_BOOST", "duration": "ONE_TIME",
		"grants": []map[string]any{{"entitlementSlug": "seats", "modifierType": "ADD", "modifierValue": "5"}},
	})
	publish(t, boost)
	redemption := redeem(t, s.instance.Slug, *boost.Code)
	exec(t, `UPDATE voucher SET expires_at = now() - interval '1 minute' WHERE id = $1`, ending.ID)
	exec(t, `UPDATE instance_voucher SET redeemed_at = now() - interval '1 day', effective_starts_at = now() - interval '1 day',
	            effective_expires_at = now() - interval '1 minute' WHERE id = $1`, redemption.ID)

	sweep := expiry.New(uow.NewUnitOfWork(testDb.DbPool))
	expired, err := sweep.Pass(t.Context(), 100)
	require.NoError(t, err)
	require.Equal(t, 2, expired)

	require.Equal(t, catalogue.StatusExpired, commonfixture.AssertJSONResponse[catalogue.Voucher](t,
		call(t, "GET", "/api/vouchers/"+ending.ID.String(), nil), fiber.StatusOK).Status)
	require.Equal(t, catalogue.StatusActive, commonfixture.AssertJSONResponse[catalogue.Voucher](t,
		call(t, "GET", "/api/vouchers/"+lasting.ID.String(), nil), fiber.StatusOK).Status)
	announced := outboxPayloads(t, "VOUCHER_EXPIRED")
	require.Len(t, announced, 1)
	require.Equal(t, "Spring", announced[0]["name"])
	require.NotContains(t, announced[0], "code")

	listed := commonfixture.AssertJSONResponse[[]catalogue.Redemption](t,
		call(t, "GET", "/api/instances/"+s.instance.Slug+"/vouchers", nil), fiber.StatusOK)
	require.Equal(t, "EXPIRED", listed[0].Status)
	require.NotNil(t, listed[0].ExpiredAt)
	require.Len(t, outboxPayloads(t, "INSTANCE_VOUCHER_EXPIRED"), 1)

	again, err := sweep.Pass(t.Context(), 100)
	require.NoError(t, err)
	require.Zero(t, again, "expired once")
}

package gate_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	vouchercatalogue "github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/redeemvoucher"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/validatevoucher"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

func TestPublicSessionVoucherRedemptionPreservesBillingRefusals(t *testing.T) {
	m := member{currentuser.User{ID: uuid.New(), OrganizationID: uuid.New()}}
	for _, tc := range []struct {
		gate   gate.Gate
		code   string
		status int
	}{
		{gate.New(false, nil), gate.CodeDisabled, http.StatusForbidden},
		{gate.New(true, plans{}), gate.CodeNotEntitled, http.StatusForbidden},
		{gate.New(true, plans{unavailable: dogfooding.BillingEntitlementSlug}), gate.CodeEntitlementCheckUnavailable, http.StatusServiceUnavailable},
	} {
		u := redeemvoucher.NewUseCase(vouchercatalogue.Deps{UserProvider: m, Gate: tc.gate})
		redemption, err := u.ForSession(t.Context(), "instance", "PROMO", false)
		require.Nil(t, redemption)
		require.Equal(t, tc.code, apierrors.GetCode(err))
		require.Equal(t, tc.status, apierrors.GetHTTPStatus(err))
	}
}

type countedPortalPlans struct {
	plans
	calls int
}

func (p *countedPortalPlans) Entitled(ctx context.Context, org uuid.UUID, slug string) (bool, error) {
	p.calls++
	return p.plans.Entitled(ctx, org, slug)
}

func TestPublicSessionValidationLimitsGrantRefusedChecksBeforeLicensing(t *testing.T) {
	m := member{currentuser.User{ID: uuid.New(), OrganizationID: uuid.New()}}
	for _, unavailable := range []string{"", dogfooding.VouchersEntitlementSlug} {
		source := &countedPortalPlans{plans: plans{grants: map[string]bool{dogfooding.BillingEntitlementSlug: true}, unavailable: unavailable}}
		u := validatevoucher.NewUseCase(vouchercatalogue.Deps{UserProvider: m, Gate: gate.New(true, source)})
		check := validatevoucher.OpaqueCheck{Code: "PROMO", SessionID: uuid.New(), CustomerID: uuid.New()}
		for range 10 {
			voucher, err := u.Opaque(t.Context(), check)
			require.NoError(t, err)
			require.Nil(t, voucher)
		}
		callsBeforeLimit := source.calls
		voucher, err := u.Opaque(t.Context(), check)
		require.Nil(t, voucher)
		require.Error(t, err)
		require.Equal(t, http.StatusTooManyRequests, apierrors.GetHTTPStatus(err))
		require.Equal(t, "ValidateVoucher.RateLimited", apierrors.GetCode(err))
		require.Equal(t, callsBeforeLimit, source.calls, "an exhausted session budget still contacted licensing")
	}
}

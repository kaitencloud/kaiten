package createcheckoutsession

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

type checkoutGrants struct {
	asks    []string
	unknown bool
}

func (g *checkoutGrants) Entitled(_ context.Context, _ uuid.UUID, slug string) (bool, error) {
	g.asks = append(g.asks, slug)
	if g.unknown && slug == dogfooding.VouchersEntitlementSlug {
		return false, errors.New("authority unavailable")
	}
	return slug == dogfooding.BillingEntitlementSlug, nil
}

func TestStartConfigurationAndLimitsPrecedeLicensing(t *testing.T) {
	source := &checkoutGrants{}
	u := &UseCase{deps: Deps{Gate: gate.New(true, source), Limits: checkout.StartLimits(config.BillingCheckoutLimits{PerKeyPerHour: 1})}}
	start := Start{OrganizationID: uuid.New(), PublishableKeyID: uuid.New()}
	code := "PROMO"
	draft := checkout.CheckoutSessionDraft{VoucherCode: &code, DryRun: true}
	require.Equal(t, apierrors.GetCode(disabled()), apierrors.GetCode(u.authorizeStart(t.Context(), start, draft, false)))
	require.Empty(t, source.asks, "disabled checkout must not probe licensing")
	err := u.authorizeStart(t.Context(), start, draft, true)
	require.Equal(t, operation+".VoucherInvalid", apierrors.GetCode(err))
	require.Equal(t, http.StatusUnprocessableEntity, apierrors.GetHTTPStatus(err))
	asked := len(source.asks)
	err = u.authorizeStart(t.Context(), start, draft, true)
	require.Equal(t, operation+".RateLimited", apierrors.GetCode(err), "grant refusals consume checkout buckets")
	require.Len(t, source.asks, asked, "rate-limited calls must not probe licensing")
}

func TestUnknownVoucherGrantIsOpaqueAtStart(t *testing.T) {
	code := "PROMO"
	u := &UseCase{deps: Deps{Gate: gate.New(true, &checkoutGrants{unknown: true})}}
	err := u.authorizeStart(t.Context(), Start{OrganizationID: uuid.New()}, checkout.CheckoutSessionDraft{VoucherCode: &code}, true)
	require.Equal(t, operation+".VoucherInvalid", apierrors.GetCode(err))
	require.Equal(t, http.StatusUnprocessableEntity, apierrors.GetHTTPStatus(err))
}

func TestPublicVoucherErrorPreservesOtherRefusals(t *testing.T) {
	for _, code := range []string{"Vouchers.NotEntitled", "Vouchers.EntitlementCheckUnavailable"} {
		err := PublicVoucherError(operation, apierrors.Unavailable(code, "not disclosed"))
		require.Equal(t, operation+".VoucherInvalid", apierrors.GetCode(err))
		require.Equal(t, "this voucher cannot be applied", err.Error())
	}
	other := apierrors.Unavailable("Addons.EntitlementCheckUnavailable", "retry")
	require.Same(t, other, PublicVoucherError(operation, other))
	require.Nil(t, PublicVoucherError(operation, nil))
}

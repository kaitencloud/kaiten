package confirmcheckoutsession

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

type selectionEntitlements struct {
	grants      map[string]bool
	unavailable string
}

func (s selectionEntitlements) Entitled(_ context.Context, _ uuid.UUID, slug string) (bool, error) {
	if slug == s.unavailable {
		return false, errors.New("KbK unavailable")
	}
	return s.grants[slug], nil
}

func TestOpenCheckoutSelectionRequiresCurrentGrants(t *testing.T) {
	for _, tc := range []struct {
		name        string
		selection   checkout.Selection
		granted     bool
		unavailable string
		wantCode    string
		wantStatus  int
	}{
		{"base plan only", checkout.Selection{}, false, "", "", 0},
		{"voucher lost since start", checkout.Selection{Voucher: &checkout.SelectedVoucher{Code: "PROMO"}}, false, "", "Vouchers.NotEntitled", http.StatusForbidden},
		{"addon lost since start", checkout.Selection{AddOns: []checkout.SelectedAddon{{AddonSlug: "extra"}}}, false, "", "Addons.NotEntitled", http.StatusForbidden},
		{"voucher authority unknown", checkout.Selection{Voucher: &checkout.SelectedVoucher{Code: "PROMO"}}, true, dogfooding.VouchersEntitlementSlug, "Vouchers.EntitlementCheckUnavailable", http.StatusServiceUnavailable},
		{"addon authority unknown", checkout.Selection{AddOns: []checkout.SelectedAddon{{AddonSlug: "extra"}}}, true, dogfooding.AddonsEntitlementSlug, "Addons.EntitlementCheckUnavailable", http.StatusServiceUnavailable},
		{"growth selection", checkout.Selection{Voucher: &checkout.SelectedVoucher{Code: "PROMO"}, AddOns: []checkout.SelectedAddon{{AddonSlug: "extra"}}}, true, "", "", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			u := &UseCase{deps: Deps{Gate: gate.New(true, selectionEntitlements{
				grants:      map[string]bool{dogfooding.BillingEntitlementSlug: true, dogfooding.VouchersEntitlementSlug: tc.granted, dogfooding.AddonsEntitlementSlug: tc.granted},
				unavailable: tc.unavailable,
			})}}
			err := u.requireSelection(t.Context(), uuid.New(), tc.selection)
			if tc.wantCode == "" {
				require.NoError(t, err)
				return
			}
			require.Equal(t, tc.wantCode, apierrors.GetCode(err))
			require.Equal(t, tc.wantStatus, apierrors.GetHTTPStatus(err))
		})
	}
}

func TestCheckoutSelectionKeepsBillingFirst(t *testing.T) {
	u := &UseCase{deps: Deps{Gate: gate.New(false, nil)}}
	err := u.requireSelection(t.Context(), uuid.New(), checkout.Selection{Voucher: &checkout.SelectedVoucher{Code: "PROMO"}})
	require.Equal(t, gate.CodeDisabled, apierrors.GetCode(err))
}

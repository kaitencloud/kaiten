package createcheckoutsession

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/validatevoucher"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type refusingVoucherPort struct{ err error }

func (p refusingVoucherPort) VisitorWithinOperation(context.Context, validatevoucher.VisitorCheck) (*catalogue.Voucher, error) {
	return nil, p.err
}

func TestSelectedVoucherKeepsPortGrantRefusalsOpaque(t *testing.T) {
	for _, err := range []error{
		apierrors.Forbidden("Vouchers.NotEntitled", "private plan detail"),
		apierrors.Unavailable("Vouchers.EntitlementCheckUnavailable", "private plan detail"),
	} {
		voucher, refusal := SelectedVoucher(t.Context(), refusingVoucherPort{err}, operation, uuid.New(), "PROMO", uuid.New(), nil)
		require.Nil(t, voucher)
		require.Equal(t, operation+".VoucherInvalid", apierrors.GetCode(refusal))
		require.Equal(t, http.StatusUnprocessableEntity, apierrors.GetHTTPStatus(refusal))
		require.Equal(t, "this voucher cannot be applied", refusal.Error())
	}
	other := apierrors.Forbidden("Billing.NotEntitled", "billing refused")
	_, err := SelectedVoucher(t.Context(), refusingVoucherPort{other}, operation, uuid.New(), "PROMO", uuid.New(), nil)
	require.Same(t, other, err)
}

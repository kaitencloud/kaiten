package createsessioncheckout

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestVoucherGrantRefusalsAreOpaque(t *testing.T) {
	for _, code := range []string{"Vouchers.NotEntitled", "Vouchers.EntitlementCheckUnavailable"} {
		err := translate(kaitenerrors.Unavailable(code, "plan details"))
		require.Equal(t, operation+".VoucherInvalid", kaitenerrors.GetCode(err))
		require.Equal(t, http.StatusUnprocessableEntity, kaitenerrors.GetHTTPStatus(err))
	}
}

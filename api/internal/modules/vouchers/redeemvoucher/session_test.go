package redeemvoucher

import (
	"errors"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestSessionVoucherRefusalPreservesStatePrecedenceAndOpacity(t *testing.T) {
	for _, permission := range []error{
		apierrors.Forbidden("Vouchers.NotEntitled", "refused"),
		apierrors.Unavailable("Vouchers.EntitlementCheckUnavailable", "retry"),
	} {
		for _, tc := range []struct {
			state   db.GetRedeemSubscriptionStateRow
			readErr error
			code    string
			status  int
		}{
			{db.GetRedeemSubscriptionStateRow{}, pgx.ErrNoRows, sessionOperation + ".NoLiveSubscription", http.StatusConflict},
			{db.GetRedeemSubscriptionStateRow{Status: "CANCELED"}, nil, sessionOperation + ".NoLiveSubscription", http.StatusConflict},
			{db.GetRedeemSubscriptionStateRow{Status: "INCOMPLETE"}, nil, sessionOperation + ".SubscriptionIncomplete", http.StatusConflict},
			{db.GetRedeemSubscriptionStateRow{Status: "ACTIVE", CheckoutPending: true}, nil, sessionOperation + ".SubscriptionIncomplete", http.StatusConflict},
			{db.GetRedeemSubscriptionStateRow{Status: "ACTIVE"}, nil, sessionOperation + ".VoucherInvalid", http.StatusUnprocessableEntity},
			{db.GetRedeemSubscriptionStateRow{Status: "TRIAL"}, nil, sessionOperation + ".VoucherInvalid", http.StatusUnprocessableEntity},
		} {
			err := sessionRefusal(tc.state, tc.readErr, permission)
			require.Equal(t, tc.code, apierrors.GetCode(err))
			require.Equal(t, tc.status, apierrors.GetHTTPStatus(err))
		}
	}
	require.NoError(t, sessionRefusal(db.GetRedeemSubscriptionStateRow{Status: "ACTIVE"}, nil, nil))
	readErr := errors.New("database unavailable")
	require.ErrorIs(t, sessionRefusal(db.GetRedeemSubscriptionStateRow{}, readErr, nil), readErr)
}

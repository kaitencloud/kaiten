package prices

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// TestMeters_RefusesACombinedEntitlementFirst: a combined entitlement is never
// granted, so it would fail EntitlementNotGranted -- without naming the reason.
// Its refusal comes before every other, so it does.
func TestMeters_RefusesACombinedEntitlementFirst(t *testing.T) {
	sum := db.AggregationMethodSUM
	month := db.EntitlementResetPeriodMONTH
	combined := db.GetPricingEntitlementRow{
		Type: db.EntitlementTypeNUMBER, AggregationMethod: &sum, ResetPeriod: &month, UsageSource: db.EntitlementUsageSourceCOMBINEDUSAGE,
	}

	_, err := Meters("CreateLicensePrice", Draft{}, combined, 0)

	require.Error(t, err)
	require.True(t, kaitenerrors.IsUnprocessable(err))
	require.Equal(t, "CreateLicensePrice.EntitlementIsCombined", kaitenerrors.GetCode(err))

	// Lifetime too: the stock refusal does not hide the reason.
	combined.ResetPeriod = nil
	_, err = Meters("CreateLicensePrice", Draft{}, combined, 0)
	require.Equal(t, "CreateLicensePrice.EntitlementIsCombined", kaitenerrors.GetCode(err))
}

func TestMeters_AcceptsACalculatedEntitlementAsBefore(t *testing.T) {
	sum := db.AggregationMethodSUM
	month := db.EntitlementResetPeriodMONTH
	calculated := db.GetPricingEntitlementRow{
		Type: db.EntitlementTypeNUMBER, AggregationMethod: &sum, ResetPeriod: &month, UsageSource: db.EntitlementUsageSourceCALCULATEDUSAGE,
		GrantValue: []byte(`{"type":"number","value":100}`),
	}

	factor, err := Meters("CreateLicensePrice", Draft{}, calculated, 0)

	require.NoError(t, err)
	require.Equal(t, "1", factor)
}

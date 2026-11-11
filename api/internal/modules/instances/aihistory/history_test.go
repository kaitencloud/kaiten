package aihistory

import (
	"encoding/json"
	"math/big"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func numeric(unscaled int64, exp int32) pgtype.Numeric {
	return pgtype.Numeric{Int: big.NewInt(unscaled), Exp: exp, Valid: true}
}

func TestFilterOfLeavesEmptyParametersUnset(t *testing.T) {
	filter := FilterOf(FilterQuery{Limit: 7})
	require.Equal(t, Filter{Limit: 7}, filter)
}

func TestFilterOfConvertsEveryParameter(t *testing.T) {
	filter := FilterOf(FilterQuery{Status: "COMMITTED", TransactionID: "tx", Authorized: "false", ModelSlug: "gpt", Model: "gpt-4o-2024", RequestType: "EMBEDDING", Cursor: "c"})
	require.Equal(t, db.AiInferenceStatusCOMMITTED, *filter.Status)
	require.Equal(t, "tx", *filter.TransactionID)
	require.False(t, *filter.Authorized)
	require.Equal(t, "gpt", *filter.ModelSlug)
	require.Equal(t, "gpt-4o-2024", *filter.Model)
	require.Equal(t, db.AiRequestTypeEMBEDDING, *filter.RequestType)
	require.Equal(t, "c", *filter.Cursor)
	require.True(t, *FilterOf(FilterQuery{Authorized: "true"}).Authorized)
}

func TestResolvePageDefaultsAndLimits(t *testing.T) {
	now := time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)
	p, err := resolvePage(organizationOperation, Filter{}, now)
	require.NoError(t, err)
	require.Equal(t, now, p.to.Time)
	require.Equal(t, now.Add(-DefaultRange), p.from.Time)
	require.EqualValues(t, DefaultLimit, p.limit)
	require.Nil(t, p.cursorID)

	p, err = resolvePage(organizationOperation, Filter{Limit: 10_000}, now)
	require.NoError(t, err)
	require.EqualValues(t, MaxLimit, p.limit)
}

func TestResolvePageRejectsAnEmptyRangeAndABadCursorUnderItsOperation(t *testing.T) {
	now := time.Now().UTC()
	for _, operation := range []string{pairOperation, organizationOperation} {
		_, err := resolvePage(operation, Filter{From: now, To: now}, now)
		var problem *apierrors.Error
		require.ErrorAs(t, err, &problem)
		require.Equal(t, http.StatusUnprocessableEntity, problem.HTTPStatus())
		require.Equal(t, operation+".InvalidRange", problem.Code)

		bad := "not-a-cursor"
		_, err = resolvePage(operation, Filter{Cursor: &bad}, now)
		require.ErrorAs(t, err, &problem)
		require.Equal(t, operation+".InvalidCursor", problem.Code)
	}
}

func TestPresentBareRowHasEmptyWarningsAndNoExplanation(t *testing.T) {
	item := present(t.Context(), db.AiInference{ID: uuid.New(), Status: db.AiInferenceStatusRESERVED, ModelRef: "m"}, nil, nil)
	require.NotNil(t, item.Warnings)
	require.Empty(t, item.Warnings)
	require.Nil(t, item.Pricing)
	require.Nil(t, item.LicenseID)
	require.Nil(t, item.LicenseSlug)
	require.Nil(t, item.ReportSeq)
	require.Nil(t, item.VendorCost)

	wire, err := json.Marshal(item)
	require.NoError(t, err)
	require.Contains(t, string(wire), `"warnings":[]`)
	require.NotContains(t, string(wire), `"pricing"`)
	require.NotContains(t, string(wire), `"vendorCost"`)
}

func TestPresentCarriesTheExplanation(t *testing.T) {
	rule, license := uuid.New(), uuid.New()
	seq := int64(42)
	pricing := `{"ruleId":"` + rule.String() + `","specificity":"EXACT_TYPED","rates":{"perOutputToken":"0.003"},"minimumCreditsPerRequest":"0","maximumCreditsPerRequest":null,"chargeOnError":"NEVER"}`
	slug := "pro"
	item := present(t.Context(), db.AiInference{ID: uuid.New(), Pricing: []byte(pricing), LicenseID: &license, Warnings: []string{"OVERDRAWN"}, ReportSeq: &seq, VendorCostComputed: numeric(123, -4)}, nil, &slug)
	require.Equal(t, rule, item.Pricing.RuleID)
	require.EqualValues(t, "EXACT_TYPED", item.Pricing.Specificity)
	require.Equal(t, "0.003", *item.Pricing.Rates.PerOutputToken)
	require.Nil(t, item.Pricing.Rates.PerInputToken)
	require.Nil(t, item.Pricing.MaximumCreditsPerRequest)
	require.Equal(t, license.String(), *item.LicenseID)
	require.Equal(t, "pro", *item.LicenseSlug)
	require.Equal(t, []string{"OVERDRAWN"}, item.Warnings)
	require.Equal(t, int64(42), *item.ReportSeq)
	require.Nil(t, item.VendorCost.Reported)
	require.Equal(t, "0.0123", *item.VendorCost.Computed)
	require.Equal(t, "USD", item.VendorCost.Currency)
}

func TestPresentDeletedLicenceKeepsItsID(t *testing.T) {
	license := uuid.New()
	item := present(t.Context(), db.AiInference{LicenseID: &license, VendorCostReported: numeric(5, 0)}, nil, nil)
	require.Equal(t, license.String(), *item.LicenseID)
	require.Nil(t, item.LicenseSlug)
	require.Equal(t, "5", *item.VendorCost.Reported)
	require.Nil(t, item.VendorCost.Computed)
}

// One undecodable snapshot must not hide the page it is on: the row is still
// listed, without pricing, and says why. The stored warnings are not touched.
func TestPresentListsARowWhoseSnapshotIsCorrupt(t *testing.T) {
	license := uuid.New()
	stored := []string{"OVERDRAWN"}
	row := db.AiInference{ID: uuid.New(), TransactionID: "tx", Status: db.AiInferenceStatusCOMMITTED, Pricing: []byte(`{"ruleId":"nope"}`), LicenseID: &license, Warnings: stored, CreditsCharged: numeric(7, 0)}
	item := present(t.Context(), row, nil, nil)
	require.Nil(t, item.Pricing)
	require.Equal(t, []string{"OVERDRAWN", schema.AiWarningPricingSnapshotUnreadable}, item.Warnings)
	require.Equal(t, []string{"OVERDRAWN"}, stored, "the row's own warnings are not rewritten")
	require.Equal(t, "tx", item.TransactionID)
	require.Equal(t, "7", *item.Credits.Charged)
	require.Equal(t, license.String(), *item.LicenseID)

	bare := present(t.Context(), db.AiInference{ID: uuid.New(), Pricing: []byte(`not json`)}, nil, nil)
	require.Nil(t, bare.Pricing)
	require.Equal(t, []string{schema.AiWarningPricingSnapshotUnreadable}, bare.Warnings)
}

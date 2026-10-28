package licenseprices_test

import (
	"context"
	"errors"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

type previewUnavailableFlags struct{ calls int }

func (f *previewUnavailableFlags) BooleanValue(context.Context, uuid.UUID, string) (bool, error) {
	f.calls++
	return false, errors.New("platform unavailable")
}

func TestMixedLicenseFinancialPreviewDoesNotRequireAIAvailability(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	slug := pricedVersion(t)
	pool := uuid.New()
	org, actor := testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO entitlement (id,organization_id,name,slug,type,aggregation_method)
		VALUES ($1,$2,'Existing AI','existing-ai','NUMBER_AI_CREDIT','SUM')`, pool, org)
	require.NoError(t, err)
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO license_entitlement (organization_id,license_id,entitlement_id,value,limit_cap_exceeded_overage_percent,created_by_id,updated_by_id)
		SELECT $1,id,$2,'{"type":"number","value":10}',0,$3,$3 FROM license WHERE organization_id=$1 AND slug=$4`, org, pool, actor, slug)
	require.NoError(t, err)
	before := len(commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, org))
	// Default-off server still rates the ordinary sample on the mixed licence.
	got := preview(t, slug, sample("tokens", "130500"))
	require.EqualValues(t, 5340, got.Total)
	require.Len(t, got.Lines, 2)
	require.Equal(t, "tokens", *got.Lines[0].EntitlementSlug)

	flags := &previewUnavailableFlags{}
	unavailable := tests.NewTestServer(testDb, tests.TestServerOptions{
		PlatformFlags: flags, ConnectorEntitlements: entitlements,
		ConfigOverride: func(cfg *config.Config) {
			cfg.Billing.Enabled = true
			cfg.Billing.PeriodClose.Interval = -1
		},
	})
	t.Cleanup(func() { require.NoError(t, unavailable.Close()) })
	got = commonfixture.AssertJSONResponse[rating.InvoicePreview](t,
		callOn(t, unavailable, "POST", "/api/licenses/"+slug+"/invoice-preview", sample("tokens", "130500")), fiber.StatusOK)
	require.EqualValues(t, 5340, got.Total)
	require.Zero(t, flags.calls, "financial display must not contact the rollout source")
	require.Len(t, commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, org), before, "preview writes nothing")
}

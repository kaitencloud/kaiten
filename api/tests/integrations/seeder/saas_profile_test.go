package seeder_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/seeder"
	saasprofile "github.com/kaitencloud/kaiten/api/internal/seeder/profiles/saas"
	"github.com/kaitencloud/kaiten/api/tests"
)

// TestSaasProfileSeedsExactlyDogfoodingAndDemoSandbox guards the SaaS-context
// org shape: no TMNT HQ, no Foot Clan, Dogfooding gets all five identities,
// Demo Sandbox gets the four staff only, and neither gets any product data.
func TestSaasProfileSeedsExactlyDogfoodingAndDemoSandbox(t *testing.T) {
	ctx := context.Background()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)

	sc := seeder.NewSeederContext(testDB.DbPool, nil)
	require.NoError(t, saasprofile.NewProfile().Seed(ctx, sc))

	require.Zero(t, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM organization WHERE external_id IN ('org_tmnt_hq', 'org_foot_clan')`))
	require.Equal(t, 1, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM organization WHERE external_id = 'org_dogfooding'`))
	require.Equal(t, 1, countRows(t, ctx, testDB, `SELECT COUNT(*) FROM organization WHERE external_id = 'org_demo_sandbox'`))

	tmntExternalIDs := "('user_splinter', 'user_leo', 'user_donnie', 'user_raph', 'user_april')"
	require.Equal(t, 5, countRows(t, ctx, testDB, `
		SELECT COUNT(*) FROM user_on_organization uoo
		JOIN organization o ON o.id = uoo.organization_id
		JOIN "user" u ON u.id = uoo.user_id
		WHERE o.external_id = 'org_dogfooding' AND u.external_id IN `+tmntExternalIDs))
	require.Equal(t, 4, countRows(t, ctx, testDB, `
		SELECT COUNT(*) FROM user_on_organization uoo
		JOIN organization o ON o.id = uoo.organization_id
		JOIN "user" u ON u.id = uoo.user_id
		WHERE o.external_id = 'org_demo_sandbox' AND u.external_id IN `+tmntExternalIDs))
	require.Zero(t, countRows(t, ctx, testDB, `
		SELECT COUNT(*) FROM user_on_organization uoo
		JOIN organization o ON o.id = uoo.organization_id
		JOIN "user" u ON u.id = uoo.user_id
		WHERE o.external_id = 'org_demo_sandbox' AND u.external_id = 'user_april'
	`), "April must not be a Demo Sandbox member")

	require.Zero(t, countRows(t, ctx, testDB, `
		SELECT COUNT(*) FROM customer c
		JOIN organization o ON o.id = c.organization_id
		WHERE o.external_id IN ('org_dogfooding', 'org_demo_sandbox')
	`), "neither org should carry any product data")
}

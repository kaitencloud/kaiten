package seeder_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/platformflags"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	demoprofile "github.com/kaitencloud/kaiten/api/internal/seeder/profiles/demo"
	devprofile "github.com/kaitencloud/kaiten/api/internal/seeder/profiles/dev"
	localaiprofile "github.com/kaitencloud/kaiten/api/internal/seeder/profiles/local-ai"
	"github.com/kaitencloud/kaiten/api/tests"
)

// Disposable DB fixtures: prepared for integration CI, never run as local
// bootstrap or as part of source-only verification.
func TestLocalAIProfileConvergesExistingDBUsingActualIdentityIDs(t *testing.T) {
	ctx := t.Context()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)
	sc := seeder.NewSeederContext(testDB.DbPool, nil)
	platformID, tenantID := uuid.New(), uuid.New()
	_, err = sc.EnsureOrganization(ctx, organizationdb.CreateOrganizationParams{ID: platformID, ExternalID: "org_dogfooding", Name: "Legacy Dogfooding"})
	require.NoError(t, err)
	_, err = sc.EnsureOrganization(ctx, organizationdb.CreateOrganizationParams{ID: tenantID, ExternalID: demoprofile.OrganizationExternalID, Name: demoprofile.OrganizationName})
	require.NoError(t, err)
	// Record an existing dev run first; that record must not skip local-ai.
	require.NoError(t, seeder.Run(ctx, testDB.DbPool, []seeder.Profile{devprofile.NewProfile()}, seeder.RunOptions{}))
	require.Zero(t, countRows(t, ctx, testDB, `SELECT count(*) FROM feature_flags WHERE organization_id=$1 AND slug='ai-credits'`, platformID.String()))
	profiles := []seeder.Profile{localaiprofile.NewProfile()}
	require.NoError(t, seeder.Run(ctx, testDB.DbPool, profiles, seeder.RunOptions{}))
	reader := platformflags.New(testDB.DbPool, platformID)
	value, err := reader.BooleanValue(ctx, tenantID, "ai-credits")
	require.NoError(t, err)
	require.True(t, value, "actual legacy Sushi UUID is the target")
	value, err = reader.BooleanValue(ctx, demoprofile.OrganizationID, "ai-credits")
	require.NoError(t, err)
	require.False(t, value, "requested/static Sushi UUID must not be the target")
	otherID := uuid.New()
	value, err = reader.BooleanValue(ctx, otherID, "ai-credits")
	require.NoError(t, err)
	require.False(t, value)
	// Simulate definition drift, then prove a recorded local-ai run converges.
	_, err = testDB.DbPool.Exec(ctx, `UPDATE feature_flags SET default_variant='{"type":"basic","value":"on"}', targeting_rules=NULL WHERE organization_id=$1 AND slug='ai-credits'`, platformID)
	require.NoError(t, err)
	require.NoError(t, seeder.Run(ctx, testDB.DbPool, profiles, seeder.RunOptions{}))
	value, err = reader.BooleanValue(ctx, otherID, "ai-credits")
	require.NoError(t, err)
	require.False(t, value)
	value, err = reader.BooleanValue(ctx, tenantID, "ai-credits")
	require.NoError(t, err)
	require.True(t, value)
	require.Equal(t, 1, countRows(t, ctx, testDB, `SELECT count(*) FROM feature_flags WHERE organization_id=$1 AND slug='ai-credits'`, platformID.String()))
}

func TestOrdinaryDemoDoesNotWritePlatformRolloutOrAIData(t *testing.T) {
	ctx := t.Context()
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)
	sc := seeder.NewSeederContext(testDB.DbPool, nil)
	// Default-off demo has no selected platform reader. It cannot create its own
	// ai-credits flag as an authorization shortcut.
	require.NoError(t, demoprofile.NewProfile().Seed(ctx, sc))
	var tenantID uuid.UUID
	require.NoError(t, testDB.DbPool.QueryRow(ctx, `SELECT id FROM organization WHERE external_id=$1`, demoprofile.OrganizationExternalID).Scan(&tenantID))
	require.Zero(t, countRows(t, ctx, testDB, `SELECT count(*) FROM feature_flags WHERE slug='ai-credits' AND organization_id=$1`, tenantID.String()))
	require.Zero(t, countRows(t, ctx, testDB, `SELECT count(*) FROM model WHERE organization_id=$1`, tenantID.String()))
	require.Equal(t, 6, countRows(t, ctx, testDB, `SELECT count(*) FROM entitlement WHERE organization_id=$1`, tenantID.String()))
	require.Equal(t, 7, countRows(t, ctx, testDB, `SELECT count(*) FROM feature_flags WHERE organization_id=$1`, tenantID.String()))
}

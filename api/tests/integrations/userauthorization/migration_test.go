package userauthorization_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensuremembership"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/ensureuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/storage"
	"github.com/kaitencloud/kaiten/api/tests"
)

// These fixtures are inserted into the actual legacy schema BEFORE Up, not
// post-migration assignments that would skip the upgrade/latch behavior.
func TestAuthorizationMigrationLegacyBackfillOnce(t *testing.T) {
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)
	require.NoError(t, database.DownTo(t.Context(), testDB.ConnectionString, 20261016000000))
	pool, err := database.ConnectDB(testDB.ConnectionString)
	require.NoError(t, err)
	defer pool.Close()
	orgA, orgB := testDB.DefaultData.OrganizationID, uuid.New()
	_, err = pool.Exec(t.Context(), `INSERT INTO organization(id,external_id,name) VALUES ($1,$2,'Legacy B')`, orgB, uuid.NewString())
	require.NoError(t, err)
	// The helper's default human is also a genuine legacy member after DownTo.
	eligible := int64(1)
	expected := []string{orgA.String() + ":" + testDB.DefaultData.UserID.String()}
	for _, kind := range []string{"human", "human", "deleted-user", "deleted-membership", "machine", "system-human"} {
		id, subject := uuid.New(), uuid.NewString()
		userType := "human"
		if kind == "machine" {
			userType = "machine"
		}
		if kind == "system-human" {
			subject = "system:" + subject
		}
		_, err = pool.Exec(t.Context(), `INSERT INTO "user"(id,external_id,name,type,slug,organization_id,deleted_at)
   VALUES ($1,$2,'Legacy',$3::user_type,$2,CASE WHEN $3::user_type='machine' THEN $4::uuid ELSE NULL END,CASE WHEN $5 THEN now() ELSE NULL END)`, id, subject, userType, orgA, kind == "deleted-user")
		require.NoError(t, err)
		for _, org := range []uuid.UUID{orgA, orgB} {
			_, err = pool.Exec(t.Context(), `INSERT INTO user_on_organization(organization_id,user_id,deleted_at) VALUES ($1,$2,CASE WHEN $3 THEN now() ELSE NULL END)`, org, id, kind == "deleted-membership")
			require.NoError(t, err)
			if kind == "human" {
				eligible++
				expected = append(expected, org.String()+":"+id.String())
			}
		}
	}
	require.NoError(t, database.RunMigrations(testDB.ConnectionString))
	var count int64
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM user_organization_authorization WHERE roles=ARRAY['administrator']::text[]`).Scan(&count))
	require.Equal(t, eligible, count)
	rows, err := pool.Query(t.Context(), `SELECT organization_id::text || ':' || user_id::text FROM user_organization_authorization WHERE roles=ARRAY['administrator']::text[]`)
	require.NoError(t, err)
	actual := []string{}
	for rows.Next() {
		var membership string
		require.NoError(t, rows.Scan(&membership))
		actual = append(actual, membership)
	}
	require.NoError(t, rows.Err())
	rows.Close()
	require.ElementsMatch(t, expected, actual)

	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM user_administrator_bootstrap`).Scan(&count))
	require.EqualValues(t, 1, count)
	// Migration startup is idempotent, not a grant reset: demote one migrated
	// member, insert a new legacy-shaped human, and run Up again.
	_, err = pool.Exec(t.Context(), `UPDATE user_organization_authorization SET roles='{}' WHERE user_id=$1`, testDB.DefaultData.UserID)
	require.NoError(t, err)
	late := uuid.New()
	_, err = pool.Exec(t.Context(), `INSERT INTO "user"(id,external_id,name) VALUES ($1,$2,'Later');`, late, uuid.NewString())
	require.NoError(t, err)
	_, err = pool.Exec(t.Context(), `INSERT INTO user_on_organization(organization_id,user_id) VALUES ($1,$2)`, orgA, late)
	require.NoError(t, err)
	require.NoError(t, database.RunMigrations(testDB.ConnectionString))
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM user_organization_authorization WHERE 'administrator'=ANY(roles)`).Scan(&count))
	require.Equal(t, eligible-1, count)
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM user_organization_authorization WHERE user_id=$1`, late).Scan(&count))
	require.Zero(t, count)
	// Removing all upgraded administrators cannot reopen bootstrap. Latch has
	// deliberately no FK; ordinary later JIT users stay denied.
	_, err = pool.Exec(t.Context(), `DELETE FROM user_organization_authorization`)
	require.NoError(t, err)
	unit := uow.NewUnitOfWork(pool)
	provision := ensureuser.NewUseCase(ensureuser.Deps{Uof: unit, Membership: ensuremembership.NewUseCase(unit)})
	id, err := provision.Execute(t.Context(), command(orgA))
	require.NoError(t, err)
	assignment, err := storage.New(unit).Resolve(t.Context(), orgA, id)
	require.NoError(t, err)
	require.False(t, assignment.IsAdministrator())
}

func TestAuthorizationMigrationNoEligibleHumansLeavesBootstrapEmpty(t *testing.T) {
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)
	require.NoError(t, database.DownTo(t.Context(), testDB.ConnectionString, 20261016000000))
	pool, err := database.ConnectDB(testDB.ConnectionString)
	require.NoError(t, err)
	defer pool.Close()
	// The infrastructure system account and its membership remain, but the only
	// human fixture is removed before applying the first authorization migration.
	_, err = pool.Exec(t.Context(), `UPDATE "user" SET deleted_at=now() WHERE id=$1`, testDB.DefaultData.UserID)
	require.NoError(t, err)
	require.NoError(t, database.RunMigrations(testDB.ConnectionString))
	var count int64
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM user_administrator_bootstrap`).Scan(&count))
	require.Zero(t, count)
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT count(*) FROM user_organization_authorization`).Scan(&count))
	require.Zero(t, count)
	// The separate existing twelve-way concurrent bootstrap test verifies the
	// empty-deployment election across organizations after all migrations.
}

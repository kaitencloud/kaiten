package userauthorization_test

import (
	"context"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensuremembership"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/ensureuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/storage"
	"github.com/kaitencloud/kaiten/api/tests"
)

func TestOrganizationBootstrapPolicies(t *testing.T) {
	database, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(database.TearDown)
	unit := uow.NewUnitOfWork(database.DbPool)
	provision := ensureuser.NewUseCase(ensureuser.Deps{Uof: unit, Membership: ensuremembership.NewUseCase(unit)})
	org := database.DefaultData.OrganizationID

	t.Run("same user retries and demotion do not regrant", func(t *testing.T) {
		cmd := command(org)
		first, err := provision.Execute(t.Context(), cmd)
		require.NoError(t, err)
		for range 3 {
			id, err := provision.Execute(t.Context(), cmd)
			require.NoError(t, err)
			require.Equal(t, first, id)
		}
		// Privileged recovery can bypass the last-admin guard, but not reopen JIT.
		_, err = database.DbPool.Exec(t.Context(), `UPDATE user_organization_authorization SET roles='{}' WHERE user_id=$1`, first)
		require.NoError(t, err)
		_, err = provision.Execute(t.Context(), cmd)
		require.NoError(t, err)
		assignment, err := storage.New(unit).Resolve(t.Context(), org, first)
		require.NoError(t, err)
		require.Empty(t, assignment.Roles)
		require.EqualValues(t, 1, scalar(t, database, `SELECT count(*) FROM organization_administrator_bootstrap`))
	})

	t.Run("explicit empty policy survives deletion and external identity recreation", func(t *testing.T) {
		require.NoError(t, database.Reset())
		_, err := database.DbPool.Exec(t.Context(), `INSERT INTO user_organization_authorization(organization_id,user_id,roles) VALUES ($1,$2,'{}')`, org, database.DefaultData.UserID)
		require.NoError(t, err)
		_, err = database.DbPool.Exec(t.Context(), `DELETE FROM user_organization_authorization WHERE organization_id=$1`, org)
		require.NoError(t, err)
		id, err := provision.Execute(t.Context(), command(org))
		require.NoError(t, err)
		assignment, err := storage.New(unit).Resolve(t.Context(), org, id)
		require.NoError(t, err)
		require.Empty(t, assignment.Roles)
		var externalID string
		require.NoError(t, database.DbPool.QueryRow(t.Context(), `SELECT external_id FROM organization WHERE id=$1`, org).Scan(&externalID))
		_, err = database.DbPool.Exec(t.Context(), `DELETE FROM organization WHERE id=$1`, org)
		require.NoError(t, err)
		for _, recreatedID := range []uuid.UUID{org, uuid.New()} {
			_, err = database.DbPool.Exec(t.Context(), `INSERT INTO organization(id,external_id,name) VALUES ($1,$2,'Recreated')`, recreatedID, externalID)
			require.NoError(t, err)
			id, err = provision.Execute(t.Context(), command(recreatedID))
			require.NoError(t, err)
			assignment, err = storage.New(unit).Resolve(t.Context(), recreatedID, id)
			require.NoError(t, err)
			require.Empty(t, assignment.Roles)
			_, err = database.DbPool.Exec(t.Context(), `DELETE FROM organization WHERE id=$1`, recreatedID)
			require.NoError(t, err)
		}
	})
}

func TestOrganizationBootstrapAcrossPools(t *testing.T) {
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		pool, err := database.ConnectDB(testDB.ConnectionString)
		require.NoError(t, err)
		t.Cleanup(pool.Close)
		unit := uow.NewUnitOfWork(pool)
		provision := ensureuser.NewUseCase(ensureuser.Deps{Uof: unit, Membership: ensuremembership.NewUseCase(unit)})
		wg.Go(func() {
			<-start
			_, err := provision.Execute(t.Context(), command(testDB.DefaultData.OrganizationID))
			errs <- err
		})
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}
	require.EqualValues(t, 1, scalar(t, testDB, `SELECT count(*) FROM organization_administrator_bootstrap WHERE user_id IS NOT NULL`))
	require.EqualValues(t, 1, scalar(t, testDB, `SELECT count(*) FROM user_organization_authorization WHERE 'administrator'=ANY(roles)`))
}

func TestOrganizationBootstrapUpgrade(t *testing.T) {
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)
	require.NoError(t, database.DownTo(t.Context(), testDB.ConnectionString, 20261022000000))
	org := testDB.DefaultData.OrganizationID
	// Retain a global winner whose organization was physically deleted.
	deletedOrg := uuid.New()
	_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO user_administrator_bootstrap(singleton,user_id,organization_id) VALUES (TRUE,$1,$2)`, testDB.DefaultData.UserID, deletedOrg)
	require.NoError(t, err)
	sealed := []uuid.UUID{deletedOrg}
	for _, policy := range []string{"administrator", "viewer", "disabled", "empty"} {
		id, subject := uuid.New(), uuid.NewString()
		sealed = append(sealed, id)
		_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO organization(id,external_id,name) VALUES ($1,$2,$2)`, id, subject)
		require.NoError(t, err)
		_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO user_on_organization(organization_id,user_id) VALUES ($1,$2)`, id, testDB.DefaultData.UserID)
		require.NoError(t, err)
		roles := []string{}
		if policy == "administrator" || policy == "viewer" {
			roles = []string{policy}
		}
		_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO user_organization_authorization(organization_id,user_id,roles,enabled) VALUES ($1,$2,$3,$4)`, id, testDB.DefaultData.UserID, roles, policy != "disabled")
		require.NoError(t, err)
	}
	// Exercise the actual released #71 role schema without recreating it.
	roleOrg := uuid.New()
	sealed = append(sealed, roleOrg)
	_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO organization(id,external_id,name) VALUES ($1,$2,'Role policy')`, roleOrg, uuid.NewString())
	require.NoError(t, err)
	_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO user_organization_role(organization_id,slug,name) VALUES ($1,'custom','Custom')`, roleOrg)
	require.NoError(t, err)
	require.NoError(t, database.RunMigrations(testDB.ConnectionString))
	require.EqualValues(t, 6, scalar(t, testDB, `SELECT count(*) FROM organization_administrator_bootstrap`))
	require.EqualValues(t, 1, scalar(t, testDB, `SELECT count(*) FROM user_administrator_bootstrap`))
	// Default legacy human membership exists but has never had an assignment.
	unit := uow.NewUnitOfWork(testDB.DbPool)
	provision := ensureuser.NewUseCase(ensureuser.Deps{Uof: unit, Membership: ensuremembership.NewUseCase(unit)})
	var subject string
	require.NoError(t, testDB.DbPool.QueryRow(t.Context(), `SELECT external_id FROM "user" WHERE id=$1`, testDB.DefaultData.UserID).Scan(&subject))
	id, err := provision.Execute(t.Context(), &ensureuser.Command{Subject: subject, OrganizationID: org})
	require.NoError(t, err)
	assignment, err := storage.New(unit).Resolve(t.Context(), org, id)
	require.NoError(t, err)
	require.True(t, assignment.IsAdministrator())
	_, err = testDB.DbPool.Exec(t.Context(), `DELETE FROM user_organization_authorization`)
	require.NoError(t, err)
	require.NoError(t, database.RunMigrations(testDB.ConnectionString))
	_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO organization(id,external_id,name) VALUES ($1,$2,'Previously deleted')`, deletedOrg, uuid.NewString())
	require.NoError(t, err)
	for _, sealedOrg := range sealed {
		id, err := provision.Execute(t.Context(), command(sealedOrg))
		require.NoError(t, err)
		assignment, err := storage.New(unit).Resolve(t.Context(), sealedOrg, id)
		require.NoError(t, err)
		require.Empty(t, assignment.Roles)
	}
	_, err = provision.Execute(t.Context(), &ensureuser.Command{Subject: subject, OrganizationID: org})
	require.NoError(t, err)
	assignment, err = storage.New(unit).Resolve(t.Context(), org, id)
	require.NoError(t, err)
	require.Empty(t, assignment.Roles)
	require.EqualValues(t, 7, scalar(t, testDB, `SELECT count(*) FROM organization_administrator_bootstrap`))
	// Definitions created after upgrade alone do not suppress a new org's election.
	newOrg := uuid.New()
	_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO organization(id,external_id,name) VALUES ($1,$2,'New')`, newOrg, uuid.NewString())
	require.NoError(t, err)
	_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO user_organization_role(organization_id,slug,name) VALUES ($1,'custom','Custom')`, newOrg)
	require.NoError(t, err)
	id, err = provision.Execute(t.Context(), command(newOrg))
	require.NoError(t, err)
	assignment, err = storage.New(unit).Resolve(t.Context(), newOrg, id)
	require.NoError(t, err)
	require.True(t, assignment.IsAdministrator())
}

func TestOrganizationBootstrapIdentityAliases(t *testing.T) {
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)
	unit := uow.NewUnitOfWork(testDB.DbPool)
	provision := ensureuser.NewUseCase(ensureuser.Deps{Uof: unit, Membership: ensuremembership.NewUseCase(unit)})
	org := testDB.DefaultData.OrganizationID
	_, err = provision.Execute(t.Context(), command(org))
	require.NoError(t, err)
	var original string
	require.NoError(t, testDB.DbPool.QueryRow(t.Context(), `SELECT external_id FROM organization WHERE id=$1`, org).Scan(&original))
	aliases := []string{original, uuid.NewString(), uuid.NewString()}
	for _, alias := range aliases[1:] {
		for range 2 {
			// Same supported update as SeederContext.EnsureOrganization; repeated
			// rebinding must preserve earlier aliases without duplicating elections.
			_, err = testDB.DbPool.Exec(t.Context(), `UPDATE organization SET external_id=$1 WHERE id=$2`, alias, org)
			require.NoError(t, err)
		}
	}
	require.EqualValues(t, 3, scalar(t, testDB, `SELECT count(*) FROM organization_administrator_bootstrap_alias`))
	_, err = testDB.DbPool.Exec(t.Context(), `DELETE FROM organization WHERE id=$1`, org)
	require.NoError(t, err)
	for _, alias := range aliases {
		id := uuid.New()
		_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO organization(id,external_id,name) VALUES ($1,$2,'Alias')`, id, alias)
		require.NoError(t, err)
		// An alias-only recreated UUID must stay sealed even if it changes identity
		// before any JIT member exists. Its new alias is also permanently sealed.
		next := uuid.NewString()
		_, err = testDB.DbPool.Exec(t.Context(), `UPDATE organization SET external_id=$1 WHERE id=$2`, next, id)
		require.NoError(t, err)
		member, err := provision.Execute(t.Context(), command(id))
		require.NoError(t, err)
		assignment, err := storage.New(unit).Resolve(t.Context(), id, member)
		require.NoError(t, err)
		require.Empty(t, assignment.Roles)
		_, err = testDB.DbPool.Exec(t.Context(), `DELETE FROM organization WHERE id=$1`, id)
		require.NoError(t, err)
		recreated := uuid.New()
		_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO organization(id,external_id,name) VALUES ($1,$2,'Next alias')`, recreated, next)
		require.NoError(t, err)
		member, err = provision.Execute(t.Context(), command(recreated))
		require.NoError(t, err)
		assignment, err = storage.New(unit).Resolve(t.Context(), recreated, member)
		require.NoError(t, err)
		require.Empty(t, assignment.Roles)
		_, err = testDB.DbPool.Exec(t.Context(), `DELETE FROM organization WHERE id=$1`, recreated)
		require.NoError(t, err)
	}
	require.EqualValues(t, 1, scalar(t, testDB, `SELECT count(*) FROM organization_administrator_bootstrap WHERE user_id IS NOT NULL`))
}

func TestOrganizationBootstrapMigrationWriterLocks(t *testing.T) {
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)
	require.NoError(t, database.DownTo(t.Context(), testDB.ConnectionString, 20261022000000))
	body, err := os.ReadFile("../../../internal/infrastructure/database/migrations/20261101000000_organization_administrator_bootstrap.sql")
	require.NoError(t, err)
	up, _, ok := strings.Cut(string(body), "-- +goose Down")
	require.True(t, ok)
	// Execute the real migration in two stages, with a deterministic transaction
	// gate immediately after its write locks and before any history snapshot.
	prefix, rest, ok := strings.Cut(up, "LOCK TABLE user_organization_authorization IN SHARE ROW EXCLUSIVE MODE;")
	require.True(t, ok)
	prefix += "LOCK TABLE user_organization_authorization IN SHARE ROW EXCLUSIVE MODE;"
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	writer, err := testDB.DbPool.Acquire(ctx)
	require.NoError(t, err)
	defer writer.Release()
	migrator, err := testDB.DbPool.Acquire(ctx)
	require.NoError(t, err)
	defer migrator.Release()
	org, user := testDB.DefaultData.OrganizationID, testDB.DefaultData.UserID
	before, after := uuid.NewString(), uuid.NewString()
	// An already-running identity/assignment writer must finish BEFORE snapshots.
	writeTx, err := writer.Begin(ctx)
	require.NoError(t, err)
	defer writeTx.Rollback(context.Background())
	_, err = writeTx.Exec(ctx, `UPDATE organization SET external_id=$1 WHERE id=$2`, before, org)
	require.NoError(t, err)
	migrationTx, err := migrator.Begin(ctx)
	require.NoError(t, err)
	_, err = migrationTx.Exec(ctx, "SET LOCAL lock_timeout='100ms'")
	require.NoError(t, err)
	_, err = migrationTx.Exec(ctx, prefix)
	var lockError *pgconn.PgError
	require.ErrorAs(t, err, &lockError)
	require.Equal(t, "55P03", lockError.Code)
	require.NoError(t, migrationTx.Rollback(ctx))
	_, err = writeTx.Exec(ctx, `INSERT INTO user_organization_authorization(organization_id,user_id) VALUES ($1,$2)`, org, user)
	require.NoError(t, err)
	require.NoError(t, writeTx.Commit(ctx))

	// Old bootstrap can hold a global-latch insertion before reaching assignments.
	// Migration must block BEFORE taking the assignment lock, not hold that lock
	// while waiting for the latch writer (which would deadlock the old transaction).
	writeTx, err = writer.Begin(ctx)
	require.NoError(t, err)
	defer writeTx.Rollback(context.Background())
	_, err = writeTx.Exec(ctx, `SELECT id FROM organization WHERE id=$1 FOR NO KEY UPDATE`, org)
	require.NoError(t, err)
	_, err = writeTx.Exec(ctx, `INSERT INTO user_administrator_bootstrap(singleton,user_id,organization_id) VALUES (TRUE,$1,$2)`, user, org)
	require.NoError(t, err)
	migrationTx, err = migrator.Begin(ctx)
	require.NoError(t, err)
	_, err = migrationTx.Exec(ctx, "SET LOCAL lock_timeout='100ms'")
	require.NoError(t, err)
	_, err = migrationTx.Exec(ctx, prefix)
	require.ErrorAs(t, err, &lockError)
	require.Equal(t, "55P03", lockError.Code)
	require.NoError(t, migrationTx.Rollback(ctx))
	_, err = writeTx.Exec(ctx, `UPDATE user_organization_authorization SET roles=ARRAY['administrator'] WHERE organization_id=$1 AND user_id=$2`, org, user)
	require.NoError(t, err)
	require.NoError(t, writeTx.Commit(ctx))

	migrationTx, err = migrator.Begin(ctx)
	require.NoError(t, err)
	defer migrationTx.Rollback(context.Background())
	_, err = migrationTx.Exec(ctx, prefix)
	require.NoError(t, err)
	// No sleeps/goroutine timing: server lock_timeout proves both supported write
	// paths cannot cross the gate while snapshots/triggers are being installed.
	for _, statement := range []string{
		`UPDATE organization SET external_id='blocked' WHERE id=$1`,
		`INSERT INTO user_organization_authorization(organization_id,user_id) SELECT $1,user_id FROM user_on_organization WHERE organization_id=$1 ON CONFLICT DO NOTHING`,
	} {
		writeTx, err = writer.Begin(ctx)
		require.NoError(t, err)
		_, err = writeTx.Exec(ctx, "SET LOCAL lock_timeout='100ms'")
		require.NoError(t, err)
		_, err = writeTx.Exec(ctx, statement, org)
		require.ErrorAs(t, err, &lockError)
		require.Equal(t, "55P03", lockError.Code)
		require.NoError(t, writeTx.Rollback(ctx))
	}
	_, err = migrationTx.Exec(ctx, rest)
	require.NoError(t, err)
	require.NoError(t, migrationTx.Commit(ctx))
	// Retrying after migration commit records new identity aliases atomically.
	_, err = writer.Exec(ctx, `UPDATE organization SET external_id=$1 WHERE id=$2`, after, org)
	require.NoError(t, err)
	_, err = writer.Exec(ctx, `DELETE FROM user_organization_authorization WHERE organization_id=$1`, org)
	require.NoError(t, err)
	var count int
	require.NoError(t, writer.QueryRow(ctx, `SELECT count(*) FROM organization_administrator_bootstrap_alias WHERE external_id=ANY($1::text[])`, []string{before, after}).Scan(&count))
	require.Equal(t, 2, count)
	require.NoError(t, writer.QueryRow(ctx, `SELECT count(*) FROM organization_administrator_bootstrap WHERE organization_id=$1`, org).Scan(&count))
	require.Equal(t, 1, count)
	// A pending old writer resumes after trigger installation. Deleting its grant
	// must not erase initialization history for a previously unassigned org.
	secondOrg, secondAlias := uuid.New(), uuid.NewString()
	_, err = writer.Exec(ctx, `INSERT INTO organization(id,external_id,name) VALUES ($1,$2,'Pending writer')`, secondOrg, secondAlias)
	require.NoError(t, err)
	_, err = writer.Exec(ctx, `INSERT INTO user_on_organization(organization_id,user_id) VALUES ($1,$2)`, secondOrg, user)
	require.NoError(t, err)
	writeTx, err = writer.Begin(ctx)
	require.NoError(t, err)
	defer writeTx.Rollback(context.Background())
	_, err = writeTx.Exec(ctx, `INSERT INTO user_organization_authorization(organization_id,user_id) VALUES ($1,$2)`, secondOrg, user)
	require.NoError(t, err)
	// The direct seeder grant must hold the org lock before assignment tuple locks,
	// otherwise a concurrent rebind could miss the uncommitted initialization.
	rebindTx, err := migrator.Begin(ctx)
	require.NoError(t, err)
	_, err = rebindTx.Exec(ctx, "SET LOCAL lock_timeout='100ms'")
	require.NoError(t, err)
	nextAlias := uuid.NewString()
	_, err = rebindTx.Exec(ctx, `UPDATE organization SET external_id=$1 WHERE id=$2`, nextAlias, secondOrg)
	require.ErrorAs(t, err, &lockError)
	require.Equal(t, "55P03", lockError.Code)
	require.NoError(t, rebindTx.Rollback(ctx))
	require.NoError(t, writeTx.Commit(ctx))
	_, err = migrator.Exec(ctx, `UPDATE organization SET external_id=$1 WHERE id=$2`, nextAlias, secondOrg)
	require.NoError(t, err)
	_, err = writer.Exec(ctx, `DELETE FROM user_organization_authorization WHERE organization_id=$1`, secondOrg)
	require.NoError(t, err)
	require.NoError(t, writer.QueryRow(ctx, `SELECT count(*) FROM organization_administrator_bootstrap_alias WHERE external_id=ANY($1::text[])`, []string{secondAlias, nextAlias}).Scan(&count))
	require.Equal(t, 2, count)
}

func TestOrganizationBootstrapMixedVersionLegacyElection(t *testing.T) {
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)
	unit := uow.NewUnitOfWork(testDB.DbPool)
	provision := ensureuser.NewUseCase(ensureuser.Deps{Uof: unit, Membership: ensuremembership.NewUseCase(unit)})
	body, err := os.ReadFile("testdata/legacy_bootstrap_52b714df.sql")
	require.NoError(t, err)
	// Exact released #71 SQL; only sqlc parameter bindings are adapted for pgx.
	legacySQL := strings.NewReplacer("sqlc.arg(user_id)", "$1", "sqlc.arg(organization_id)", "$2").Replace(string(body))
	oldLogin := func(org, user uuid.UUID) bool {
		t.Helper()
		var won bool
		err := unit.Transact(t.Context(), func(ctx context.Context) error {
			if _, err := unit.DBTX(ctx).Exec(ctx, `SELECT id FROM organization WHERE id=$1 FOR NO KEY UPDATE`, org); err != nil {
				return err
			}
			return unit.DBTX(ctx).QueryRow(ctx, legacySQL, user, org).Scan(&won)
		})
		require.NoError(t, err)
		return won
	}
	member := func(org uuid.UUID) uuid.UUID {
		t.Helper()
		id, subject := uuid.New(), uuid.NewString()
		_, err := testDB.DbPool.Exec(t.Context(), `INSERT INTO "user"(id,external_id,name,email) VALUES ($1,$2,'Old pod member',$3)`, id, subject, subject+"@verification.local")
		require.NoError(t, err)
		_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO user_on_organization(organization_id,user_id) VALUES ($1,$2)`, org, id)
		require.NoError(t, err)
		return id
	}
	legacyRecord := func() string {
		t.Helper()
		var row string
		require.NoError(t, testDB.DbPool.QueryRow(t.Context(), `SELECT row_to_json(b)::text FROM user_administrator_bootstrap b`).Scan(&row))
		return row
	}
	assertOtherOrganization := func() {
		t.Helper()
		before := legacyRecord()
		other := uuid.New()
		_, err := testDB.DbPool.Exec(t.Context(), `INSERT INTO organization(id,external_id,name) VALUES ($1,$2,'Independent')`, other, uuid.NewString())
		require.NoError(t, err)
		id, err := provision.Execute(t.Context(), command(other))
		require.NoError(t, err)
		assignment, err := storage.New(unit).Resolve(t.Context(), other, id)
		require.NoError(t, err)
		require.True(t, assignment.IsAdministrator())
		require.Equal(t, before, legacyRecord())
	}
	t.Run("released-query-positive-control", func(t *testing.T) {
		require.NoError(t, testDB.Reset())
		org := testDB.DefaultData.OrganizationID
		b := member(org)
		require.True(t, oldLogin(org, b), "fixture must elect an eligible member when the legacy latch is empty")
		assignment, err := storage.New(unit).Resolve(t.Context(), org, b)
		require.NoError(t, err)
		require.True(t, assignment.IsAdministrator())
		assertOtherOrganization()
	})
	for _, mode := range []string{"automatic", "preserve-existing-global-record", "explicit-demo-policy", "preexisting-demo-policy", "rollback"} {
		t.Run(mode, func(t *testing.T) {
			require.NoError(t, testDB.Reset())
			org := testDB.DefaultData.OrganizationID
			cmd := command(org)
			var preserved string
			if mode == "preserve-existing-global-record" {
				_, err := testDB.DbPool.Exec(t.Context(), `INSERT INTO user_administrator_bootstrap(singleton,user_id,organization_id,claimed_at) VALUES (TRUE,$1,$2,'2026-10-23T00:00:00Z')`, testDB.DefaultData.UserID, org)
				require.NoError(t, err)
				preserved = legacyRecord()
			}
			if mode == "rollback" {
				rollback := errors.New("rollback mixed-version initialization")
				err := unit.Transact(t.Context(), func(ctx context.Context) error {
					_, err := provision.Execute(ctx, cmd)
					require.NoError(t, err)
					return rollback
				})
				require.ErrorIs(t, err, rollback)
				require.Zero(t, scalar(t, testDB, `SELECT count(*) FROM user_administrator_bootstrap`))
				require.Zero(t, scalar(t, testDB, `SELECT count(*) FROM user_organization_authorization`))
				require.Zero(t, scalar(t, testDB, `SELECT count(*) FROM organization_administrator_bootstrap`))
				require.Zero(t, scalar(t, testDB, `SELECT count(*) FROM organization_administrator_bootstrap_alias`))
			}
			if mode == "preexisting-demo-policy" {
				require.NoError(t, database.DownTo(t.Context(), testDB.ConnectionString, 20261022000000))
				_, err := testDB.DbPool.Exec(t.Context(), `INSERT INTO user_organization_authorization(organization_id,user_id,roles) VALUES ($1,$2,ARRAY['administrator'])`, org, testDB.DefaultData.UserID)
				require.NoError(t, err)
				require.Zero(t, scalar(t, testDB, `SELECT count(*) FROM user_administrator_bootstrap`))
				require.NoError(t, database.RunMigrations(testDB.ConnectionString))
				// Historical explicit policy is sealed, not relabeled as a new winner.
				require.Zero(t, scalar(t, testDB, `SELECT count(*) FROM organization_administrator_bootstrap WHERE user_id IS NOT NULL`))
			} else if mode == "explicit-demo-policy" {
				// Same direct assignment insertion as the demo seeder, without JIT.
				_, err := testDB.DbPool.Exec(t.Context(), `INSERT INTO user_organization_authorization(organization_id,user_id,roles) VALUES ($1,$2,ARRAY['administrator'])`, org, testDB.DefaultData.UserID)
				require.NoError(t, err)
			} else {
				id, err := provision.Execute(t.Context(), cmd)
				require.NoError(t, err)
				assignment, err := storage.New(unit).Resolve(t.Context(), org, id)
				require.NoError(t, err)
				require.True(t, assignment.IsAdministrator())
			}
			require.EqualValues(t, 1, scalar(t, testDB, `SELECT count(*) FROM user_administrator_bootstrap`))
			if preserved != "" {
				require.Equal(t, preserved, legacyRecord())
			}
			before := legacyRecord()
			b := member(org)
			require.False(t, oldLogin(org, b), "released old pod must not elect a second administrator")
			assignment, err := storage.New(unit).Resolve(t.Context(), org, b)
			require.NoError(t, err)
			require.Empty(t, assignment.Roles)
			require.Equal(t, before, legacyRecord())
			require.EqualValues(t, 1, scalar(t, testDB, `SELECT count(*) FROM user_organization_authorization WHERE 'administrator'=ANY(roles)`))
			assertOtherOrganization()
		})
	}
}

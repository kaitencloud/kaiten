package userauthorization_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensuremembership"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/ensureuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/storage"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/pkg/externalid"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
)

func TestStoredAuthorization(t *testing.T) {
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)
	uof := uow.NewUnitOfWork(testDB.DbPool)
	provision := ensureuser.NewUseCase(ensureuser.Deps{Uof: uof, Membership: ensuremembership.NewUseCase(uof)})
	store := storage.New(uof)
	q := db.New(testDB.DbPool)
	org := testDB.DefaultData.OrganizationID

	t.Run("different humans and organizations race one deployment bootstrap", func(t *testing.T) {
		org2 := uuid.New()
		_, err := testDB.DbPool.Exec(t.Context(), `INSERT INTO organization(id,external_id,name) VALUES ($1,$2,'Second')`, org2, uuid.NewString())
		require.NoError(t, err)
		const n = 12
		start := make(chan struct{})
		var wg sync.WaitGroup
		errs := make(chan error, n)
		for i := range n {
			organizationID := org
			if i%2 == 1 {
				organizationID = org2
			}
			wg.Go(func() {
				<-start
				_, err := provision.Execute(t.Context(), command(organizationID))
				errs <- err
			})
		}
		close(start)
		wg.Wait()
		close(errs)
		for err := range errs {
			require.NoError(t, err)
		}
		require.EqualValues(t, 1, scalar(t, testDB, `SELECT count(*) FROM user_administrator_bootstrap`))
		require.EqualValues(t, 1, scalar(t, testDB, `SELECT count(*) FROM user_organization_authorization WHERE 'administrator'=ANY(roles)`))
		var userID, winnerOrg uuid.UUID
		require.NoError(t, testDB.DbPool.QueryRow(t.Context(), `SELECT user_id,organization_id FROM user_administrator_bootstrap`).Scan(&userID, &winnerOrg))
		actual, err := store.Resolve(t.Context(), winnerOrg, userID)
		require.NoError(t, err)
		require.True(t, actual.IsAdministrator())
		require.Equal(t, []string{scope.WriteAll()}, actual.EffectiveScopes())
		otherOrg := org
		if winnerOrg == org {
			otherOrg = org2
		}
		_, err = store.Resolve(t.Context(), otherOrg, userID)
		require.ErrorIs(t, err, pgx.ErrNoRows)
	})

	t.Run("failed transaction and ineligible sign-ins do not consume bootstrap", func(t *testing.T) {
		require.NoError(t, testDB.Reset())
		cmd := command(org)
		rollback := errors.New("caller rollback")
		err := uof.Transact(t.Context(), func(ctx context.Context) error {
			_, err := provision.Execute(ctx, cmd)
			require.NoError(t, err)
			return rollback
		})
		require.ErrorIs(t, err, rollback)
		require.Zero(t, scalar(t, testDB, `SELECT count(*) FROM user_administrator_bootstrap`))
		for _, kind := range []string{"deleted-user", "deleted-membership", "disabled", "machine", "system"} {
			err = nil
			cmd := command(org)
			id := externalid.DeriveUserID(cmd.Subject)
			switch kind {
			case "machine":
				_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO "user"(id,external_id,name,type,slug,organization_id) VALUES ($1,$2,'Machine','machine',$2,$3)`, id, cmd.Subject, org)
			case "system":
				cmd.Subject = "system:kaiten"
			default:
				_, err = q.CreateUser(t.Context(), db.CreateUserParams{ID: &id, ExternalID: cmd.Subject, Email: &cmd.Email, Name: cmd.Name})
			}
			require.NoError(t, err)
			switch kind {
			case "deleted-user":
				_, err = q.DeleteUser(t.Context(), id)
			case "deleted-membership", "disabled":
				_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO user_on_organization(organization_id,user_id,deleted_at) VALUES ($1,$2, CASE WHEN $3 THEN now() ELSE NULL END)`, org, id, kind == "deleted-membership")
				if kind == "disabled" {
					_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO user_organization_authorization(organization_id,user_id,enabled) VALUES ($1,$2,FALSE)`, org, id)
				}
			}
			require.NoError(t, err)
			if kind == "disabled" {
				won, err := q.BootstrapUserAdministrator(t.Context(), db.BootstrapUserAdministratorParams{OrganizationID: org, UserID: id})
				require.NoError(t, err)
				require.False(t, won)
			}
			_, err = provision.Execute(t.Context(), cmd)
			require.Error(t, err, kind)
			require.Zero(t, scalar(t, testDB, `SELECT count(*) FROM user_administrator_bootstrap`), kind)
		}
		_, err = provision.Execute(t.Context(), command(org))
		require.NoError(t, err)
		require.EqualValues(t, 1, scalar(t, testDB, `SELECT count(*) FROM user_administrator_bootstrap`))
	})

	t.Run("later humans denied and bootstrap survives removal", func(t *testing.T) {
		require.NoError(t, testDB.Reset())
		first, err := provision.Execute(t.Context(), command(org))
		require.NoError(t, err)
		second, err := provision.Execute(t.Context(), command(org))
		require.NoError(t, err)
		actual, err := store.Resolve(t.Context(), org, second)
		require.NoError(t, err)
		require.True(t, actual.Enabled)
		require.Empty(t, actual.Roles)
		require.Equal(t, []string{scope.Read(scope.Profile)}, actual.EffectiveScopes())
		// Out-of-band Platform deletion is intentionally unchanged and can remove
		// an administrator; its occurrence must not reopen the bootstrap latch.
		_, err = q.DeleteUser(t.Context(), first)
		require.NoError(t, err)
		_, err = store.Resolve(t.Context(), org, first)
		require.ErrorIs(t, err, pgx.ErrNoRows)
		third, err := provision.Execute(t.Context(), command(org))
		require.NoError(t, err)
		actual, err = store.Resolve(t.Context(), org, third)
		require.NoError(t, err)
		require.False(t, actual.IsAdministrator())
		_, err = testDB.DbPool.Exec(t.Context(), `DELETE FROM organization WHERE id=$1`, org)
		require.NoError(t, err)
		require.EqualValues(t, 1, scalar(t, testDB, `SELECT count(*) FROM user_administrator_bootstrap`))
	})

	t.Run("serialized management preserves last admin and rechecks actor", func(t *testing.T) {
		require.NoError(t, testDB.Reset())
		a, err := provision.Execute(t.Context(), command(org))
		require.NoError(t, err)
		b, err := provision.Execute(t.Context(), command(org))
		require.NoError(t, err)
		admin := schema.UserAuthorization{Enabled: true, Roles: []string{schema.RoleAdministrator}}
		_, err = store.ReplaceAuthorization(t.Context(), org, a, b, admin)
		require.NoError(t, err)
		start := make(chan struct{})
		var wg sync.WaitGroup
		errs := make(chan error, 2)
		// Each admin attempts self-demotion concurrently: exactly one succeeds.
		for _, id := range []uuid.UUID{a, b} {
			wg.Go(func() {
				<-start
				_, err := store.ReplaceAuthorization(t.Context(), org, id, id, schema.UserAuthorization{Enabled: true})
				errs <- err
			})
		}
		close(start)
		wg.Wait()
		close(errs)
		var success, last int
		for err := range errs {
			if err == nil {
				success++
			} else {
				require.ErrorIs(t, err, storage.ErrLastAdministrator)
				last++
			}
		}
		require.Equal(t, 1, success)
		require.Equal(t, 1, last)
		for _, id := range []uuid.UUID{a, b} {
			actual, err := store.Resolve(t.Context(), org, id)
			require.NoError(t, err)
			if !actual.IsAdministrator() {
				_, err = store.ReplaceAuthorization(t.Context(), org, id, id, admin)
				require.ErrorIs(t, err, storage.ErrMissingPermission)
			} else {
				_, err = store.ReplaceAuthorization(t.Context(), org, id, id, schema.UserAuthorization{Enabled: false, Roles: admin.Roles})
				require.ErrorIs(t, err, storage.ErrLastAdministrator)
				_, err = store.ReplaceAuthorization(t.Context(), org, id, id, schema.UserAuthorization{Enabled: true, Permissions: []string{"write:*"}})
				require.Error(t, err)
			}
		}
	})

	t.Run("profile immutable subject managed claims and disabled membership", func(t *testing.T) {
		require.NoError(t, testDB.Reset())
		a, err := provision.Execute(t.Context(), command(org))
		require.NoError(t, err)
		cmd := command(org)
		b, err := provision.Execute(t.Context(), cmd)
		require.NoError(t, err)
		profile, err := store.UpdateProfile(t.Context(), org, a, b, "Managed", "managed@example.com")
		require.NoError(t, err)
		require.Equal(t, cmd.Subject, profile.ExternalID)
		cmd.Name = "IdP overwrite"
		cmd.Email = "idp@example.com"
		_, err = provision.Execute(t.Context(), cmd)
		require.NoError(t, err)
		row, err := q.GetOrganizationUser(t.Context(), db.GetOrganizationUserParams{OrganizationID: org, UserID: b})
		require.NoError(t, err)
		require.Equal(t, "Managed", row.Name)
		require.Equal(t, "managed@example.com", *row.Email)
		rows, err := q.ListOrganizationUsers(t.Context(), db.ListOrganizationUsersParams{OrganizationID: org, CursorID: nil, LimitPlusOne: 10})
		require.NoError(t, err)
		require.Len(t, rows, 3)
		cursor := rows[0].ID
		page, err := q.ListOrganizationUsers(t.Context(), db.ListOrganizationUsersParams{OrganizationID: org, CursorID: &cursor, LimitPlusOne: 10})
		require.NoError(t, err)
		require.Len(t, page, 2)
		_, err = store.ReplaceAuthorization(t.Context(), org, a, b, schema.UserAuthorization{Enabled: false})
		require.NoError(t, err)
		_, err = store.Resolve(t.Context(), org, b)
		require.ErrorIs(t, err, pgx.ErrNoRows)
		_, err = provision.Execute(t.Context(), cmd)
		require.Error(t, err)
		_, err = store.ReplaceAuthorization(t.Context(), org, a, b, schema.UserAuthorization{Enabled: true, Roles: []string{schema.RoleViewer}})
		require.NoError(t, err)
		actual, err := store.Resolve(t.Context(), org, b)
		require.NoError(t, err)
		require.True(t, scope.HasScope(actual.EffectiveScopes(), scope.Read(scope.Licenses)))
		_, err = store.UpdateProfile(t.Context(), uuid.New(), a, b, "Not member", "none@example.com")
		require.ErrorIs(t, err, pgx.ErrNoRows)
	})
}

func command(org uuid.UUID) *ensureuser.Command {
	id := uuid.NewString()
	return &ensureuser.Command{Subject: id, Name: "Human", Email: id + "@example.com", OrganizationID: org}
}

func scalar(t *testing.T, testDB *tests.TestDatabase, query string) int64 {
	t.Helper()
	var n int64
	require.NoError(t, testDB.DbPool.QueryRow(t.Context(), query).Scan(&n))
	return n
}

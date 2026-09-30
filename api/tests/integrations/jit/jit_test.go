package jit_test

import (
	"context"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/platform/jit"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/tests"
)

// Every subtest drives the provisioner over the real in-process surface, which is
// what the server injects -- not a stub. That is deliberate: what these tests are
// about is the upsert behaviour itself (stable derived ids, a name claim that never
// clobbers, refusals that do not resurrect), and that behaviour now lives in
// ensureorganization and ensureuser. A fake surface would leave the interesting half
// unexercised while still passing.
//
// Several subtests build a second provisioner mid-test. That is how they reach the
// database again: a resolution is cached per Provisioner, so re-checking the same
// identity through the same one would answer from the cache and assert nothing about
// the row.
func TestProvisioner(t *testing.T) {
	t.Run("is idempotent under concurrent requests and creates exactly one org/user/membership", func(t *testing.T) {
		testDB, err := tests.NewTestDatabase()
		require.NoError(t, err)
		t.Cleanup(testDB.TearDown)

		surface := newInProcessSurface(t, testDB)

		provisioner := jit.NewProvisioner(surface)

		// Same external identity (subject + external org id) resolved by two
		// concurrent requests — each gets its own Principal instance since
		// Check mutates it, but they carry identical Provisioning claims.
		sharedProvisioning := newIdentity().Provisioning

		var wg sync.WaitGroup
		identities := make([]*principal.Principal, 2)
		errs := make(chan error, len(identities))
		for i := range identities {
			identities[i] = newIdentityFromProvisioning(sharedProvisioning)
			wg.Add(1)
			go func(identity *principal.Principal) {
				defer wg.Done()
				errs <- provisioner.Check(t.Context(), identity)
			}(identities[i])
		}
		wg.Wait()
		close(errs)

		for err := range errs {
			require.NoError(t, err)
		}

		// Both calls resolved the same external identity to the same
		// generated UUIDs, and no principal was left unresolved.
		first := identities[0]
		require.NotEqual(t, uuid.Nil, first.UserID)
		require.NotEqual(t, uuid.Nil, first.OrganizationID)
		for _, identity := range identities[1:] {
			require.Equal(t, first.UserID, identity.UserID)
			require.Equal(t, first.OrganizationID, identity.OrganizationID)
		}

		require.Equal(t, 1, count(t, testDB, `SELECT COUNT(*) FROM organization WHERE id = $1`, first.OrganizationID))
		require.Equal(t, 1, count(t, testDB, `SELECT COUNT(*) FROM "user" WHERE id = $1`, first.UserID))
		require.Equal(t, 1, count(t, testDB, `SELECT COUNT(*) FROM user_on_organization WHERE organization_id = $1 AND user_id = $2`, first.OrganizationID, first.UserID))
	})

	// The regression this commit exists not to cause. Provisioning runs on the
	// authentication path of every request, and it now runs inside a module where every
	// other write emits an event -- so an event here would fan a webhook out per login.
	//
	// Twice, because the second login is the case that matters: the insert path happens
	// once per tenant, while the no-op upsert path happens on every request forever.
	t.Run("first login provisions once and emits nothing, on the insert and the no-op path", func(t *testing.T) {
		testDB, err := tests.NewTestDatabase()
		require.NoError(t, err)
		t.Cleanup(testDB.TearDown)

		surface := newInProcessSurface(t, testDB)

		identity := newIdentity()
		require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), identity))

		retry := newIdentityFromProvisioning(identity.Provisioning)
		require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), retry))

		require.Equal(t, identity.OrganizationID, retry.OrganizationID)
		require.Equal(t, identity.UserID, retry.UserID)

		require.Equal(t, 1, count(t, testDB, `SELECT COUNT(*) FROM organization WHERE id = $1`, identity.OrganizationID))
		require.Equal(t, 1, count(t, testDB, `SELECT COUNT(*) FROM "user" WHERE id = $1`, identity.UserID))
		require.Equal(t, 1, count(t, testDB, `
			SELECT COUNT(*) FROM user_on_organization
			WHERE organization_id = $1 AND user_id = $2
		`, identity.OrganizationID, identity.UserID))

		require.Equal(t, 0, count(t, testDB, `SELECT COUNT(*) FROM outbox_events`),
			"provisioning emitted an event, which on this path means one webhook fan-out per login")
	})

	t.Run("resolves against pre-seeded rows and never changes ids", func(t *testing.T) {
		testDB, err := tests.NewTestDatabase()
		require.NoError(t, err)
		t.Cleanup(testDB.TearDown)

		surface := newInProcessSurface(t, testDB)

		externalOrgID := "existing-organization-" + uuid.NewString()
		subject := "existing-user-" + uuid.NewString()
		expectedOrganizationID := uuid.New()
		expectedUserID := uuid.New()

		_, err = testDB.DbPool.Exec(t.Context(), `
			INSERT INTO organization (id, external_id, name)
			VALUES ($1, $2, 'Pre-seeded Organization')
		`, expectedOrganizationID, externalOrgID)
		require.NoError(t, err)
		_, err = testDB.DbPool.Exec(t.Context(), `
			INSERT INTO "user" (id, external_id, email, name)
			VALUES ($1, $2, $3, 'Pre-seeded User')
		`, expectedUserID, subject, subject+"@example.com")
		require.NoError(t, err)

		identity := &principal.Principal{
			Provisioning: principal.Provisioning{
				Subject:                subject,
				ExternalOrganizationID: externalOrgID,
			},
		}
		require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), identity))

		require.Equal(t, expectedOrganizationID, identity.OrganizationID)
		require.Equal(t, expectedUserID, identity.UserID)
		require.Equal(t, 1, count(t, testDB, `SELECT COUNT(*) FROM organization WHERE id = $1 AND external_id = $2`, expectedOrganizationID, externalOrgID))
		require.Equal(t, 1, count(t, testDB, `SELECT COUNT(*) FROM "user" WHERE id = $1 AND external_id = $2`, expectedUserID, subject))
	})

	// Organizations have no soft delete to reject: deleting one removes the
	// row and cascades the tenant away. The identity provider stays the
	// authority on whether the organization exists, so a claim still arriving
	// afterwards recreates the row — empty, and at the same derived id.
	t.Run("recreates a deleted organization from scratch rather than rejecting the claim", func(t *testing.T) {
		testDB, err := tests.NewTestDatabase()
		require.NoError(t, err)
		t.Cleanup(testDB.TearDown)

		surface := newInProcessSurface(t, testDB)

		identity := newIdentity()
		require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), identity))

		_, err = testDB.DbPool.Exec(t.Context(), `DELETE FROM organization WHERE id = $1`, identity.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, 0, count(t, testDB, `SELECT COUNT(*) FROM organization WHERE id = $1`, identity.OrganizationID))
		require.Equal(t, 0, count(t, testDB, `SELECT COUNT(*) FROM user_on_organization WHERE organization_id = $1`, identity.OrganizationID))

		retry := newIdentityFromProvisioning(identity.Provisioning)
		require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), retry))

		require.Equal(t, identity.OrganizationID, retry.OrganizationID, "the derived organization id is stable across a delete")
		require.Equal(t, identity.UserID, retry.UserID, "the human user survives its organization")
		require.Equal(t, 1, count(t, testDB, `SELECT COUNT(*) FROM organization WHERE id = $1`, retry.OrganizationID))
	})

	t.Run("rejects soft-deleted user and does not restore it", func(t *testing.T) {
		testDB, err := tests.NewTestDatabase()
		require.NoError(t, err)
		t.Cleanup(testDB.TearDown)

		surface := newInProcessSurface(t, testDB)

		identity := newIdentity()
		require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), identity))

		_, err = testDB.DbPool.Exec(t.Context(), `UPDATE "user" SET deleted_at = now() WHERE id = $1`, identity.UserID)
		require.NoError(t, err)

		retry := newIdentityFromProvisioning(identity.Provisioning)
		err = jit.NewProvisioner(surface).Check(t.Context(), retry)

		require.Error(t, err)
		require.Equal(t, uuid.Nil, retry.UserID)
		require.Equal(t, uuid.Nil, retry.OrganizationID)
		require.Equal(t, 1, count(t, testDB, `SELECT COUNT(*) FROM "user" WHERE id = $1 AND deleted_at IS NOT NULL`, identity.UserID))
	})

	t.Run("organization name COALESCE never clobbers on empty claim and updates on non-empty", func(t *testing.T) {
		testDB, err := tests.NewTestDatabase()
		require.NoError(t, err)
		t.Cleanup(testDB.TearDown)

		surface := newInProcessSurface(t, testDB)

		identity := newIdentity()
		identity.Provisioning.OrganizationName = "Original Organization"
		require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), identity))
		require.Equal(t, "Original Organization", organizationName(t, testDB, identity.OrganizationID))

		// Empty org name claim must never clobber the existing name.
		emptyClaim := newIdentityFromProvisioning(identity.Provisioning)
		emptyClaim.Provisioning.OrganizationName = ""
		require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), emptyClaim))
		require.Equal(t, "Original Organization", organizationName(t, testDB, identity.OrganizationID))

		// A non-empty org name claim updates it.
		updatedClaim := newIdentityFromProvisioning(identity.Provisioning)
		updatedClaim.Provisioning.OrganizationName = "Updated Organization"
		require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), updatedClaim))
		require.Equal(t, "Updated Organization", organizationName(t, testDB, identity.OrganizationID))
	})

	t.Run("rejects soft-deleted membership and does not restore it", func(t *testing.T) {
		testDB, err := tests.NewTestDatabase()
		require.NoError(t, err)
		t.Cleanup(testDB.TearDown)

		surface := newInProcessSurface(t, testDB)

		identity := newIdentity()
		require.NoError(t, jit.NewProvisioner(surface).Check(t.Context(), identity))

		_, err = testDB.DbPool.Exec(t.Context(), `
			UPDATE user_on_organization SET deleted_at = now()
			WHERE organization_id = $1 AND user_id = $2
		`, identity.OrganizationID, identity.UserID)
		require.NoError(t, err)

		retry := newIdentityFromProvisioning(identity.Provisioning)
		err = jit.NewProvisioner(surface).Check(t.Context(), retry)

		require.Error(t, err)
		require.Equal(t, uuid.Nil, retry.UserID)
		require.Equal(t, uuid.Nil, retry.OrganizationID)
		require.Equal(t, 1, count(t, testDB, `
			SELECT COUNT(*) FROM user_on_organization
			WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
		`, identity.OrganizationID, identity.UserID))
	})
}

// newInProcessSurface builds the application the way a driver does and returns its
// credential-free surface.
//
// Only DB is set. Provisioning reads no settings, meters nothing, and needs no
// ambient identity -- its caller carries none by construction, which is the whole
// point of the surface. BackgroundWorkers stays false, so nothing registers a stop
// hook and the application can be discarded rather than closed, for the reason
// seeder.WithOrganization states at its own construction.
func newInProcessSurface(t *testing.T, testDB *tests.TestDatabase) kaiten.InProcess {
	t.Helper()

	app, err := kaiten.New(kaiten.Options{
		DB:                testDB.DbPool,
		BackgroundWorkers: false,
	})
	require.NoError(t, err)

	return app.InProcess()
}

func newIdentity() *principal.Principal {
	return newIdentityFromProvisioning(principal.Provisioning{
		Subject:                uuid.NewString(),
		ExternalOrganizationID: uuid.NewString(),
		Email:                  uuid.NewString() + "@example.com",
		Name:                   "JIT User",
		OrganizationName:       "JIT Organization",
	})
}

func newIdentityFromProvisioning(provisioning principal.Provisioning) *principal.Principal {
	return &principal.Principal{Provisioning: provisioning}
}

func organizationName(t *testing.T, testDB *tests.TestDatabase, organizationID uuid.UUID) string {
	t.Helper()
	var name string
	require.NoError(t, testDB.DbPool.QueryRow(t.Context(), `SELECT name FROM organization WHERE id = $1`, organizationID).Scan(&name))
	return name
}

func count(t *testing.T, testDB *tests.TestDatabase, query string, args ...any) int {
	t.Helper()
	var result int
	require.NoError(t, testDB.DbPool.QueryRow(context.Background(), query, args...).Scan(&result))
	return result
}

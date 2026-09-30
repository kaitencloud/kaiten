package licenses_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/updatelicense"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// TestLicenseLifecycle_CreateDefaultsToPublished pins the backward-compatible
// half: a create that says nothing about the lifecycle produces a
// servable version, exactly as it did before the state existed. Any other
// default would silently break every caller that creates a license and then
// uses it.
func TestLicenseLifecycle_CreateDefaultsToPublished(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	license, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Implicit State",
		Slug:        ptr.To("implicit-state"),
		Description: "No lifecycle state supplied",
		Type:        schema.Paid,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	require.Equal(t, schema.Published, license.LifecycleState)
}

// TestLicenseLifecycle_CreateAcceptsADraft covers the other direction: a vendor
// preparing a version says so, and it is created unservable.
func TestLicenseLifecycle_CreateAcceptsADraft(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	license, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:           "Explicit Draft",
		Slug:           ptr.To("explicit-draft"),
		Description:    "Prepared, not offered",
		Type:           schema.Paid,
		LifecycleState: schema.Draft,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	require.Equal(t, schema.Draft, license.LifecycleState)
}

// TestLicenseLifecycle_CreateRejectsAnUnpublishedDefault checks the CHECK
// reaches the caller as a conflict it can act on rather than as a 500. The two
// flags are mutually exclusive by construction: a default is what the family
// resolves to, and an unpublished version is one nothing may serve.
func TestLicenseLifecycle_CreateRejectsAnUnpublishedDefault(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:           "Draft Default",
		Slug:           ptr.To("draft-default"),
		Description:    "Asks to be the default while unpublished",
		Type:           schema.Paid,
		IsDefault:      true,
		LifecycleState: schema.Draft,
	}, testDb.DefaultData.OrganizationID)

	var kerr *kaitenerrors.Error
	require.ErrorAs(t, err, &kerr)
	require.Equal(t, "CreateLicense.DefaultMustBePublished", kerr.Code)
	require.Equal(t, kaitenerrors.KindConflict, kerr.Kind)
}

// TestLicenseLifecycle_CreateRejectsAnUnknownState pins the normalization: the
// generated enum Scan casts any string, so without the check an unrecognised
// value would reach the INSERT and come back as an opaque cast error.
func TestLicenseLifecycle_CreateRejectsAnUnknownState(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:           "Bad State",
		Slug:           ptr.To("bad-state"),
		Description:    "Not a member of the enum",
		Type:           schema.Paid,
		LifecycleState: schema.LifecycleState("RETIRED"),
	}, testDb.DefaultData.OrganizationID)

	var kerr *kaitenerrors.Error
	require.ErrorAs(t, err, &kerr)
	require.Equal(t, "CreateLicense.InvalidLifecycleState", kerr.Code)
}

// TestLicenseLifecycle_UpdateWithoutStateLeavesItAlone pins that an update
// never writes the state: EditLicense leaves lifecycle_state out altogether,
// since a version moves only through publish, archive and unarchive. An
// update that changes a description must not republish an archived
// version as a side effect of the field being absent from the body.
func TestLicenseLifecycle_UpdateWithoutStateLeavesItAlone(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	createRepo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	updateRepo := updatelicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	license, err := createRepo.CreateLicense(t.Context(), &createlicense.Command{
		Name:           "Silent Update",
		Slug:           ptr.To("silent-update"),
		Description:    "Archived from the start",
		Type:           schema.Paid,
		LifecycleState: schema.Archived,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	updated, err := updateRepo.UpdateLicense(t.Context(), &updatelicense.Command{
		Name:        license.Name,
		Description: "Description changed, lifecycle not mentioned",
		Type:        license.Type,
		Version:     license.Version,
		VersionName: license.VersionName,
		IsDefault:   false,
	}, license.Slug, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	require.Equal(t, schema.Archived, updated.LifecycleState,
		"omitting the state must not resurrect an archived version")
	require.Equal(t, "Description changed, lifecycle not mentioned", updated.Description)
}

// The state a version is in changes through publish, archive and unarchive
// (licenselifecycletransitions_test.go); update only echoes it, which
// updatelicense_test.go pins. What stays here is the one lifecycle rule an
// update can still break.

// TestLicenseLifecycle_UnsettingTheDefaultWhilePublishedIsAllowed pins the way
// out of the archive refusal for a family's default: unset the flag on its
// own, with the version staying servable, and the family resolves by version
// number instead.
func TestLicenseLifecycle_UnsettingTheDefaultWhilePublishedIsAllowed(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	createRepo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	updateRepo := updatelicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	license, err := createRepo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        "Deliberately Unset",
		Slug:        ptr.To("deliberately-unset"),
		Description: "The family's default, for now",
		Type:        schema.Paid,
		IsDefault:   true,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	updated, err := updateRepo.UpdateLicense(t.Context(), &updatelicense.Command{
		Name:        license.Name,
		Description: license.Description,
		Type:        license.Type,
		VersionName: license.VersionName,
		IsDefault:   false,
	}, license.Slug, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	require.False(t, updated.IsDefault)
	require.False(t, isDefault(t, license.Slug))
	require.Equal(t, schema.Published, lifecycleStateOfLicense(t, license.Slug))
}

// TestLicenseLifecycle_ClaimingTheDefaultWhileUnpublishedIsRefused covers the
// CHECK from the update side: a default is what the family resolves to, so a
// draft or an archived version cannot claim it, and the caller is told to
// publish or unarchive it first rather than getting a 500.
func TestLicenseLifecycle_ClaimingTheDefaultWhileUnpublishedIsRefused(t *testing.T) {
	createRepo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	updateRepo := updatelicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	for _, state := range []schema.LifecycleState{schema.Draft, schema.Archived} {
		t.Run(string(state), func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

			license, err := createRepo.CreateLicense(t.Context(), &createlicense.Command{
				Name:           "Not Servable",
				Slug:           ptr.To("not-servable"),
				Description:    "Not published, and not what the family puts forward",
				Type:           schema.Paid,
				LifecycleState: state,
			}, testDb.DefaultData.OrganizationID)
			require.NoError(t, err)

			_, err = updateRepo.UpdateLicense(t.Context(), &updatelicense.Command{
				Name:        license.Name,
				Description: license.Description,
				Type:        license.Type,
				VersionName: license.VersionName,
				IsDefault:   true,
			}, license.Slug, testDb.DefaultData.UserID, testDb.DefaultData.OrganizationID)

			var kerr *kaitenerrors.Error
			require.ErrorAs(t, err, &kerr)
			require.Equal(t, "UpdateLicense.DefaultMustBePublished", kerr.Code)
			require.Equal(t, kaitenerrors.KindConflict, kerr.Kind)
			require.False(t, isDefault(t, license.Slug), "the refused update wrote nothing")
		})
	}
}

// lifecycleStateOfLicense reads the stored state of a license by slug, for the
// assertions that have to look past what the write path returned.
func lifecycleStateOfLicense(t *testing.T, slug string) schema.LifecycleState {
	t.Helper()
	var state string
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT "lifecycle_state" FROM "license" WHERE "slug" = $1 AND "organization_id" = $2`,
		slug, testDb.DefaultData.OrganizationID).Scan(&state))
	return schema.LifecycleState(state)
}

// TestLicenseLifecycle_CreateUseCaseRefusesArchivedInAnyCase covers the rule
// where it lives, for the caller that does not go through HTTP: the seeder
// runs this use case directly, so the enum validation of the endpoint never
// sees its values. The comparison follows the repository's normalization,
// which upper-cases the state -- a lower-case "archived" would otherwise slip
// past the check and still be stored as ARCHIVED.
func TestLicenseLifecycle_CreateUseCaseRefusesArchivedInAnyCase(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	useCase := createlicense.NewUseCase(createlicense.Deps{
		UserProvider: &currentuser.StaticUserProvider{
			UserID:         testDb.DefaultData.UserID,
			OrganizationID: testDb.DefaultData.OrganizationID,
		},
		UsageReporter: services.UsageReporterOrNoop(nil),
		Uof:           uow.NewUnitOfWork(testServer.Dependencies.DB),
	})

	for _, state := range []schema.LifecycleState{schema.Archived, "archived"} {
		_, err := useCase.Execute(t.Context(), &createlicense.Command{
			Name:           "Seeded Archived",
			Description:    "Created the way a seed profile would",
			Type:           schema.Paid,
			LifecycleState: state,
		})

		var kerr *kaitenerrors.Error
		require.ErrorAsf(t, err, &kerr, "state %q", state)
		require.Equalf(t, "CreateLicense.LifecycleStateNotSettable", kerr.Code, "state %q", state)
		require.Equalf(t, kaitenerrors.KindUnprocessable, kerr.Kind, "state %q", state)
	}
}

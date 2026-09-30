package licenses_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licenseEvents "github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestLicenseLifecycleTransitions covers the three operations a version's
// lifecycle state moves through since the license-family split D2, each with the one state it
// accepts:
//
//	publish:   DRAFT     -> PUBLISHED
//	archive:   PUBLISHED -> ARCHIVED
//	unarchive: ARCHIVED  -> PUBLISHED
//
// There is no way back to DRAFT: a version that has been on sale cannot become
// one that never was.
func TestLicenseLifecycleTransitions(t *testing.T) {
	t.Run("Publish_PutsADraftOnSaleAndRecordsTheEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		draft := newLicenseInState(t, "to-publish", schema.Draft)

		published := transition[schema.License](t, draft.Slug, "publish", fiber.StatusOK)

		require.Equal(t, schema.Published, published.LifecycleState)
		require.Equal(t, schema.Published, lifecycleStateOfLicense(t, draft.Slug))
		requireLicenseEvent(t, licenseEvents.LicensePublished, draft.ID)
	})

	t.Run("Archive_WithdrawsAPublishedVersionAndRecordsTheEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		published := newLicenseInState(t, "to-archive", schema.Published)

		archived := transition[schema.License](t, published.Slug, "archive", fiber.StatusOK)

		require.Equal(t, schema.Archived, archived.LifecycleState)
		require.Equal(t, schema.Archived, lifecycleStateOfLicense(t, published.Slug))
		requireLicenseEvent(t, licenseEvents.LicenseArchived, published.ID)
	})

	t.Run("Unarchive_PutsAnArchivedVersionBackOnSaleAndRecordsTheEvent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		archived := newLicenseInState(t, "to-unarchive", schema.Archived)

		unarchived := transition[schema.License](t, archived.Slug, "unarchive", fiber.StatusOK)

		require.Equal(t, schema.Published, unarchived.LifecycleState)
		require.Equal(t, schema.Published, lifecycleStateOfLicense(t, archived.Slug))
		requireLicenseEvent(t, licenseEvents.LicenseUnarchived, archived.ID)
	})

	// Every refusal leaves the version where it was: the state is read under
	// the row lock before anything is written.
	refusals := []struct {
		name  string
		from  schema.LifecycleState
		op    string
		code  string
		hint  string
		saved schema.LifecycleState
	}{
		{"Publish_RefusesAPublishedVersion", schema.Published, "publish", "PublishLicense.NotADraft", "already published", schema.Published},
		{"Publish_RefusesAnArchivedVersionAndPointsAtUnarchive", schema.Archived, "publish", "PublishLicense.NotADraft", "unarchive", schema.Archived},
		{"Archive_RefusesADraftAndPointsAtDelete", schema.Draft, "archive", "ArchiveLicense.NotPublished", "delete", schema.Draft},
		{"Archive_RefusesAnArchivedVersion", schema.Archived, "archive", "ArchiveLicense.NotPublished", "already archived", schema.Archived},
		{"Unarchive_RefusesADraftAndPointsAtPublish", schema.Draft, "unarchive", "UnarchiveLicense.NotArchived", "publish", schema.Draft},
		{"Unarchive_RefusesAPublishedVersion", schema.Published, "unarchive", "UnarchiveLicense.NotArchived", "not archived", schema.Published},
	}
	for _, refusal := range refusals {
		t.Run(refusal.name, func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
			license := newLicenseInState(t, "refused", refusal.from)

			problem := transition[kaitenerrors.Problem](t, license.Slug, refusal.op, fiber.StatusConflict)

			require.Equal(t, refusal.code, problem.Code)
			require.Contains(t, problem.Detail, refusal.hint)
			require.Equal(t, refusal.saved, lifecycleStateOfLicense(t, license.Slug))
			requireNoLicenseEvent(t)
		})
	}

	// A default is what the family resolves to, so it cannot be withdrawn while
	// it holds the flag. The way out is to move or unset the default first.
	t.Run("Archive_RefusesTheFamilysDefault", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		defaultVersion, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Held Default",
			Slug:        ptr.To("held-default"),
			Description: "The family's default",
			Type:        schema.Paid,
			IsDefault:   true,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		problem := transition[kaitenerrors.Problem](t, defaultVersion.Slug, "archive", fiber.StatusConflict)

		require.Equal(t, "ArchiveLicense.DefaultMustBePublished", problem.Code)
		require.Equal(t, schema.Published, lifecycleStateOfLicense(t, defaultVersion.Slug))
		require.True(t, isDefault(t, defaultVersion.Slug), "the family keeps its default")
		requireNoLicenseEvent(t)
	})

	for _, op := range []struct{ path, code string }{
		{"publish", "PublishLicense.NotFound"},
		{"archive", "ArchiveLicense.NotFound"},
		{"unarchive", "UnarchiveLicense.NotFound"},
	} {
		t.Run("WhenTheVersionDoesNotExist_"+op.path+"_Returns404", func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

			problem := transition[kaitenerrors.Problem](t, "no-such-license", op.path, fiber.StatusNotFound)

			require.Equal(t, op.code, problem.Code)
		})
	}

	// What publishing is for: in a family without a default, the newest
	// published version is what the family serves, so publishing a newer draft
	// moves the family's address to it.
	t.Run("Publish_MovesTheFamilyOntoTheDraftWhenItHasNoDefault", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
		const familySlug = "rolling-out"
		_, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Rolling Out",
			Slug:        ptr.To(familySlug),
			Description: "Version 1, on sale",
			Type:        schema.Paid,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		draft, err := repo.CreateLicense(t.Context(), &createlicense.Command{
			Name:           "Rolling Out",
			FamilySlug:     ptr.To(familySlug),
			Description:    "Version 2, being prepared",
			Type:           schema.Paid,
			LifecycleState: schema.Draft,
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, "1", getFamily(t, familySlug, "").CurrentVersion.Version)

		transition[schema.License](t, draft.Slug, "publish", fiber.StatusOK)

		require.Equal(t, "2", getFamily(t, familySlug, "").CurrentVersion.Version)
	})
}

func newLicenseInState(t *testing.T, slug string, state schema.LifecycleState) *schema.License {
	t.Helper()
	repo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	license, err := repo.CreateLicense(t.Context(), &createlicense.Command{
		Name:           "Lifecycle " + slug,
		Slug:           ptr.To(slug),
		Description:    "A version in " + string(state),
		Type:           schema.Paid,
		LifecycleState: state,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	return license
}

func transition[T any](t *testing.T, slug, op string, wantStatus int) T {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/licenses/"+slug+"/"+op, nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	return commonfixture.AssertJSONResponse[T](t, resp, wantStatus)
}

func requireLicenseEvent(t *testing.T, want events.Metadata, licenseID any) {
	t.Helper()
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if event.EventName != want.Name {
			continue
		}
		require.Equal(t, want.Type, event.EventType)
		var data schema.License
		require.NoError(t, json.Unmarshal(event.Data, &data))
		require.Equal(t, licenseID, data.ID, "the event carries the version that moved")
		return
	}
	t.Fatalf("no %s event was recorded", want.Name)
}

// requireNoLicenseEvent checks that a refused transition recorded nothing
// beyond the LICENSE_CREATED events of the setup.
func requireNoLicenseEvent(t *testing.T) {
	t.Helper()
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		require.Equal(t, licenseEvents.LicenseCreated.Name, event.EventName,
			"a refused transition must not record an event")
	}
}

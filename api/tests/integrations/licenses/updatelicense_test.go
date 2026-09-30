package licenses_test

import (
	"encoding/json"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licenseEvents "github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenses"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestUpdateLicense(t *testing.T) {
	// version is readOnly since the license-family split: an update does not have to carry it,
	// and one that leaves it out keeps the stored number.
	t.Run("WhenVersionIsOmitted_UpdatesAndKeepsTheVersion", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		toUpdate := licenses[0]
		payload := schema.License{
			Name:        "Test License without version",
			Description: "This is a test license",
			Type:        schema.Community,
			IsDefault:   true,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getlicense.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetLicense(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, payload.Name, updated.Name)
		require.Equal(t, toUpdate.Version, updated.Version)
	})

	// A version's slug is derived from its number ({familySlug}-v{n}), so the
	// number cannot move without the two disagreeing. Refused rather than
	// dropped, like any field this endpoint does not change.
	t.Run("WhenVersionDiffersFromTheStoredOne_RejectsAndWritesNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		toUpdate := licenses[0]
		payload := schema.License{
			Name:        "Test License renumbered",
			Description: toUpdate.Description,
			Type:        toUpdate.Type,
			Version:     "999",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusUnprocessableEntity)
		require.Equal(t, "UpdateLicense.VersionNotSettable", problem.Code)

		repo := getlicense.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetLicense(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, toUpdate.Name, stored.Name, "a refused update writes nothing")
		require.Equal(t, toUpdate.Version, stored.Version)
	})

	t.Run("WhenSlugDiffersFromPath_Rejects", func(t *testing.T) {
		// slug is structurally writable on the shared schema.License (create
		// needs to allow it), but this endpoint has never supported renaming
		// a license -- enforced in code now rather than by a narrower
		// update-only wire type.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		toUpdate := licenses[0]
		payload := schema.License{
			Name:        "Test License renamed",
			Description: "This is a test license",
			Type:        schema.Community,
			Version:     "1",
			Slug:        "a-different-slug",
			IsDefault:   true,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenRequestIsValid_UpdatesLicense", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		toUpdate := licenses[0]
		payload := schema.License{
			Name:        "Test License updated",
			Description: "This is a test license updated",
			Type:        schema.Community,
			// Written back as it was read: the stored version is accepted.
			Version:     toUpdate.Version,
			VersionName: ptr.To("999"),
			IsDefault:   true,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getlicense.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetLicense(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, payload.Name, updated.Name)
		require.Equal(t, payload.Description, updated.Description)
		require.Equal(t, toUpdate.Version, updated.Version)
		require.Equal(t, payload.IsDefault, updated.IsDefault)
		require.Equal(t, payload.Type, updated.Type)
		require.Equal(t, payload.VersionName, updated.VersionName)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the license updated event
		var eventData schema.License
		found := false
		for _, event := range events {
			if event.EventName == licenseEvents.LicenseUpdated.Name {
				assert.Equal(t, licenseEvents.LicenseUpdated.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected LICENSE_UPDATE event to be present")

		// Verify event data contains the updated license
		assert.Equal(t, toUpdate.ID, eventData.ID)
		assert.Equal(t, payload.Name, eventData.Name)
		assert.Equal(t, payload.Description, eventData.Description)
		assert.Equal(t, payload.Type, eventData.Type)
		assert.Equal(t, payload.IsDefault, eventData.IsDefault)
	})

	t.Run("WhenLicenseDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.License{
			Name:        "Test License updated",
			Description: "This is a test license updated",
			Type:        schema.Community,
			Version:     "999",
			VersionName: ptr.To("999"),
			IsDefault:   true,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/nonexistent-slug", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	// Scoped to the family since the license-family split, not to the name: the two versions
	// below are siblings because they share a family_id, and the name they also
	// happen to share is no longer what decides that.
	t.Run("WhenSettingDefault_OnlyOneDefaultPerFamily", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		createRepo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

		versionNameV1 := "v1"
		first, err := createRepo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Development",
			Description: "Development v1",
			Type:        schema.Development,
			VersionName: &versionNameV1,
			IsDefault:   true,
			Slug:        ptr.To("development-v1-test"),
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		versionNameV2 := "v2"
		second, err := createRepo.CreateLicense(t.Context(), &createlicense.Command{
			Name:        "Development",
			Description: "Development v2",
			Type:        schema.Development,
			VersionName: &versionNameV2,
			IsDefault:   false,
			FamilySlug:  ptr.To("development-v1-test"),
			Slug:        ptr.To("development-v2-test"),
		}, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		payload := schema.License{
			Name:        second.Name,
			Description: second.Description,
			Type:        second.Type,
			Version:     second.Version,
			VersionName: second.VersionName,
			IsDefault:   true,
		}
		req := commonfixture.NewJSONRequest(
			t,
			"PUT",
			"/api/licenses/"+second.Slug,
			payload,
		)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		listRepo := getlicenses.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		allLicenses, err := listRepo.GetLicenses(
			t.Context(),
			testDb.DefaultData.OrganizationID,
			100,
			nil,
		)
		require.NoError(t, err)

		defaultCount := 0
		var updatedFirst *schema.License
		var updatedSecond *schema.License

		for _, license := range allLicenses {
			if license.Name != "Development" {
				continue
			}

			if license.IsDefault {
				defaultCount++
			}
			if license.ID == first.ID {
				updatedFirst = license
			}
			if license.ID == second.ID {
				updatedSecond = license
			}
		}

		require.NotNil(t, updatedFirst)
		require.NotNil(t, updatedSecond)
		assert.Equal(t, 1, defaultCount)
		assert.False(t, updatedFirst.IsDefault)
		assert.True(t, updatedSecond.IsDefault)
	})

	// The mirror of the subtest above: two families, so promoting one's version
	// to default leaves the other's alone. Before that split this was the "different
	// name" case, and a rename could silently turn it into the "same name" one.
	t.Run("WhenSettingDefaultInAnotherFamily_KeepsPreviousDefault", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		createRepo := createlicense.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

		communityVersion := "v1"
		community, err := createRepo.CreateLicense(
			t.Context(),
			&createlicense.Command{
				Name:        "Community",
				Description: "Community tier",
				Type:        schema.Community,
				VersionName: &communityVersion,
				IsDefault:   true,
				Slug:        ptr.To("community-default-test"),
			},
			testDb.DefaultData.OrganizationID,
		)
		require.NoError(t, err)

		proVersion := "v1"
		pro, err := createRepo.CreateLicense(
			t.Context(),
			&createlicense.Command{
				Name:        "Pro",
				Description: "Paid tier Pro",
				Type:        schema.Paid,
				VersionName: &proVersion,
				IsDefault:   false,
				Slug:        ptr.To("pro-default-test"),
			},
			testDb.DefaultData.OrganizationID,
		)
		require.NoError(t, err)

		payload := schema.License{
			Name:        pro.Name,
			Description: pro.Description,
			Type:        pro.Type,
			Version:     pro.Version,
			VersionName: pro.VersionName,
			IsDefault:   true,
		}
		req := commonfixture.NewJSONRequest(
			t,
			"PUT",
			"/api/licenses/"+pro.Slug,
			payload,
		)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		listRepo := getlicenses.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		allLicenses, err := listRepo.GetLicenses(
			t.Context(),
			testDb.DefaultData.OrganizationID,
			100,
			nil,
		)
		require.NoError(t, err)

		defaultCount := 0
		var updatedCommunity *schema.License
		var updatedPro *schema.License

		for _, license := range allLicenses {
			if license.IsDefault {
				defaultCount++
			}
			if license.ID == community.ID {
				updatedCommunity = license
			}
			if license.ID == pro.ID {
				updatedPro = license
			}
		}

		require.NotNil(t, updatedCommunity)
		require.NotNil(t, updatedPro)
		assert.Equal(t, 2, defaultCount)
		assert.True(t, updatedCommunity.IsDefault)
		assert.True(t, updatedPro.IsDefault)
	})
}

// TestUpdateLicense_FamilyIsNotReassignable pins the write-only side of the two
// family fields on the shared schema.License. familySlug names the family a
// new version joins on create and nothing else: on update its presence is a
// request to move a version between families, which does not exist, and is
// refused rather than silently dropped. familyId is always in a response, so a client writing
// back what it read sends it; that is accepted as long as it is the row's own.
func TestUpdateLicense_FamilyIsNotReassignable(t *testing.T) {
	t.Run("WhenFamilySlugIsSent_Rejects", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 2)
		toUpdate := licenses[0]

		payload := schema.License{
			Name:        toUpdate.Name,
			Description: toUpdate.Description,
			Type:        toUpdate.Type,
			Version:     toUpdate.Version,
			VersionName: toUpdate.VersionName,
			FamilySlug:  licenses[1].Slug,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusUnprocessableEntity)
		require.Equal(t, "UpdateLicense.FamilyNotReassignable", problem.Code)
	})

	t.Run("WhenFamilyIdIsAnotherFamily_RejectsAndWritesNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 2)
		toUpdate := licenses[0]

		payload := schema.License{
			Name:        "Moved elsewhere",
			Description: toUpdate.Description,
			Type:        toUpdate.Type,
			Version:     toUpdate.Version,
			VersionName: toUpdate.VersionName,
			FamilyID:    licenses[1].FamilyID,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusUnprocessableEntity)
		require.Equal(t, "UpdateLicense.FamilyNotReassignable", problem.Code)

		repo := getlicense.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetLicense(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, toUpdate.Name, stored.Name, "a refused reassignment writes nothing else either")
		require.Equal(t, toUpdate.FamilyID, stored.FamilyID)
	})

	t.Run("WhenFamilyIdIsTheLicensesOwn_Accepts", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		toUpdate := licenses[0]

		payload := schema.License{
			Name:        "Written back with its family",
			Description: toUpdate.Description,
			Type:        toUpdate.Type,
			Version:     toUpdate.Version,
			VersionName: toUpdate.VersionName,
			FamilyID:    toUpdate.FamilyID,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getlicense.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetLicense(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, payload.Name, stored.Name)
		require.Equal(t, toUpdate.FamilyID, stored.FamilyID)
	})
}

// TestUpdateLicense_LifecycleStateIsEchoOnly pins the update side: a
// version's state moves through publish, archive and unarchive, which
// apply the lifecycle rules and record their events. A PUT carrying the stored
// state is a client writing back what it read; carrying another is refused
// rather than silently dropped.
func TestUpdateLicense_LifecycleStateIsEchoOnly(t *testing.T) {
	t.Run("WhenTheStateDiffers_RejectsAndWritesNothing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toUpdate := newLicenses(t, 1)[0]

		payload := schema.License{
			Name:           "Archived through PUT",
			Description:    toUpdate.Description,
			Type:           toUpdate.Type,
			LifecycleState: schema.Archived,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusUnprocessableEntity)
		require.Equal(t, "UpdateLicense.LifecycleStateNotSettable", problem.Code)

		repo := getlicense.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetLicense(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, toUpdate.Name, stored.Name, "a refused update writes nothing")
		require.Equal(t, schema.Published, stored.LifecycleState)
	})

	t.Run("WhenTheStoredStateIsEchoed_Accepts", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toUpdate := newLicenses(t, 1)[0]

		payload := schema.License{
			Name:           "Written back with its state",
			Description:    toUpdate.Description,
			Type:           toUpdate.Type,
			Version:        toUpdate.Version,
			LifecycleState: toUpdate.LifecycleState,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
	})
}

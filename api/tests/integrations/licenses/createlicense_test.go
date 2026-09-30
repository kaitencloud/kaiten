package licenses_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	licenseEvents "github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenses"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestCreateLicense(t *testing.T) {
	t.Run("WhenRequestIsValid_CreatesLicense", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.License{
			Name:        "Test License",
			Description: "This is a test license",
			Type:        schema.Development,
			VersionName: ptr.To("Initial"),
			IsDefault:   true,
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.License](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.Equal(t, payload.Description, created.Description)
		require.Equal(t, payload.Type, created.Type)
		require.Equal(t, payload.IsDefault, created.IsDefault)
		require.Equal(t, payload.VersionName, created.VersionName)
		// version is not part of the payload: the first license of a name
		// family is version 1, assigned by the server.
		require.Equal(t, "1", created.Version)

		repo := getlicense.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetLicense(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, created.Name, stored.Name)
		require.Equal(t, created.Description, stored.Description)
		require.Equal(t, created.Type, stored.Type)
		require.Equal(t, created.Version, stored.Version)
		require.Equal(t, created.VersionName, stored.VersionName)
		require.Equal(t, created.IsDefault, stored.IsDefault)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the license created event
		var eventData schema.License
		found := false
		for _, event := range events {
			if event.EventName == licenseEvents.LicenseCreated.Name {
				assert.Equal(t, licenseEvents.LicenseCreated.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected LICENSE_CREATION event to be present")

		// Verify event data contains the created license
		assert.Equal(t, created.ID, eventData.ID)
		assert.Equal(t, created.Name, eventData.Name)
		assert.Equal(t, created.Description, eventData.Description)
		assert.Equal(t, created.Type, eventData.Type)
	})

	t.Run("WhenVersionIsSent_Rejects", func(t *testing.T) {
		// version is server-assigned (see schema.License's doc comment) and
		// readOnly on the shared schema, which huma skips on write rather than
		// rejecting -- so sending one has to be an explicit 422 rather than a
		// silently discarded value.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.License{
			Name:        "Versioned",
			Description: "Attempts to set version on create",
			Type:        schema.Development,
			Version:     "3",
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenCreatingDefaultLicenseOnDifferentName_KeepsExistingDefault", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		firstPayload := schema.License{
			Name:        "Community",
			Description: "Community v1",
			Type:        schema.Community,
			VersionName: ptr.To("v1"),
			IsDefault:   true,
		}
		firstReq := commonfixture.NewJSONRequest(t, "POST", "/api/licenses", firstPayload)
		firstResp, err := testServer.App.Test(firstReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, firstResp.Body)
		firstCreated := commonfixture.AssertJSONResponse[schema.License](
			t,
			firstResp,
			fiber.StatusCreated,
		)

		secondPayload := schema.License{
			Name:        "Pro",
			Description: "Pro v1",
			Type:        schema.Paid,
			VersionName: ptr.To("v1"),
			IsDefault:   true,
		}
		secondReq := commonfixture.NewJSONRequest(t, "POST", "/api/licenses", secondPayload)
		secondResp, err := testServer.App.Test(secondReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, secondResp.Body)
		secondCreated := commonfixture.AssertJSONResponse[schema.License](
			t,
			secondResp,
			fiber.StatusCreated,
		)

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
			if license.IsDefault {
				defaultCount++
			}
			if license.ID == firstCreated.ID {
				updatedFirst = license
			}
			if license.ID == secondCreated.ID {
				updatedSecond = license
			}
		}

		require.NotNil(t, updatedFirst)
		require.NotNil(t, updatedSecond)
		assert.Equal(t, 2, defaultCount)
		assert.True(t, updatedFirst.IsDefault)
		assert.True(t, updatedSecond.IsDefault)
	})
}

// TestCreateLicense_FamiliesIsAnOrdinarySlug pins what the families' own
// top-level path bought: nothing else lives under /licenses/ where
// {licenseSlug} goes, so a license may take the slug "families" and still be
// read back through its own GET, and the family it opens through
// /license-families/families.
func TestCreateLicense_FamiliesIsAnOrdinarySlug(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	payload := schema.License{
		Name:        "Families",
		Slug:        "families",
		Description: "Takes the slug the family list was once published under",
		Type:        schema.Development,
	}
	req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses", payload)

	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	created := commonfixture.AssertJSONResponse[schema.License](t, resp, fiber.StatusCreated)
	require.Equal(t, "families", created.Slug)

	readResp, err := testServer.App.Test(httptest.NewRequest("GET", "/api/licenses/families", nil), fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, readResp.Body)

	read := commonfixture.AssertJSONResponse[schema.License](t, readResp, fiber.StatusOK)
	require.Equal(t, created.ID, read.ID)

	require.Equal(t, created.FamilyID, getFamily(t, "families", "").ID)
}

// TestCreateLicense_ArchivedStateIsRefused pins the one lifecycle state a
// create may not ask for. ARCHIVED means withdrawn from sale, and only
// archive-license withdraws a version -- from PUBLISHED, recording
// LICENSE_ARCHIVED -- so a version created archived would read as withdrawn
// without ever having been on sale. Refused before anything is written: no
// version, and no family either, since a new family would have been opened for
// it.
func TestCreateLicense_ArchivedStateIsRefused(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	payload := schema.License{
		Name:           "Born Archived",
		Slug:           "born-archived",
		Description:    "Asks to start withdrawn from sale",
		Type:           schema.Paid,
		LifecycleState: schema.Archived,
	}
	req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses", payload)

	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	problem := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, fiber.StatusUnprocessableEntity)
	require.Equal(t, "CreateLicense.LifecycleStateNotSettable", problem.Code)

	var licenses, families int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `
		SELECT (SELECT COUNT(*) FROM license WHERE organization_id = $1 AND slug = $2),
		       (SELECT COUNT(*) FROM license_family WHERE organization_id = $1 AND slug = $2)
	`, testDb.DefaultData.OrganizationID, payload.Slug).Scan(&licenses, &families))
	require.Zero(t, licenses, "the refused version must not be written")
	require.Zero(t, families, "nor the family it would have opened")
}

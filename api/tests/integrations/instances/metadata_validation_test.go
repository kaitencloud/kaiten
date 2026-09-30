package instances_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func seedInstanceMetadataField(t *testing.T, key, label string, jsonSchema map[string]any, displayOrder int32) metadatafieldsdb.MetadataField {
	t.Helper()
	schemaBytes, err := json.Marshal(jsonSchema)
	require.NoError(t, err)
	row, err := metadatafieldsdb.New(testServer.Dependencies.DB).InsertMetadataField(context.Background(), metadatafieldsdb.InsertMetadataFieldParams{
		OrganizationID: testDb.DefaultData.OrganizationID,
		ResourceType:   metadatafieldsdb.MetadataFieldResourceTypeINSTANCE,
		Key:            key,
		Label:          label,
		JsonSchema:     schemaBytes,
		DisplayOrder:   displayOrder,
		UserID:         testDb.DefaultData.UserID,
	})
	require.NoError(t, err)
	// We seeded via the raw repository (not the API handler) so the
	// validator's process-wide schema cache doesn't get auto-invalidated.
	// Drop it explicitly so the next ValidateMetadataForResource call
	// sees the seeded row.
	validator.ClearCache()
	return row
}

func archiveInstanceMetadataField(t *testing.T, field metadatafieldsdb.MetadataField) {
	t.Helper()
	_, err := metadatafieldsdb.New(testServer.Dependencies.DB).ArchiveMetadataField(context.Background(), metadatafieldsdb.ArchiveMetadataFieldParams{
		ID:             field.ID,
		OrganizationID: testDb.DefaultData.OrganizationID,
		UserID:         testDb.DefaultData.UserID,
	})
	require.NoError(t, err)
	validator.ClearCache() // see seedInstanceMetadataField
}

// TestCreateInstanceMetadataValidation covers the create path for the
// INSTANCE side: tolerant mode (unknown keys pass) but declared keys are
// still type-checked.
func TestCreateInstanceMetadataValidation(t *testing.T) {
	resetDB := func() { require.NoError(t, testDb.Reset()) }

	t.Run("WhenMetadataMatchesDeclared_Creates201", func(t *testing.T) {
		t.Cleanup(resetDB)
		customer := newCustomer(t)
		license := newLicense(t)
		seedInstanceMetadataField(t, "environment", "Environment",
			map[string]any{"type": "string", "enum": []any{"production", "staging"}}, 0)

		payload := schema.Instance{
			Name:             "ok-instance",
			Description:      "tolerant accept",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			Metadata: map[string]any{
				"environment": "production",
				"unknown_key": "still ok because INSTANCE is tolerant",
			},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusCreated, resp.StatusCode)
	})

	t.Run("WhenDeclaredKeyViolatesEnum_Returns422", func(t *testing.T) {
		t.Cleanup(resetDB)
		customer := newCustomer(t)
		license := newLicense(t)
		seedInstanceMetadataField(t, "environment", "Environment",
			map[string]any{"type": "string", "enum": []any{"production", "staging"}}, 0)

		payload := schema.Instance{
			Name:             "bad-instance",
			Description:      "wrong env",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			Metadata: map[string]any{
				"environment": "BAD_ENV",
			},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenArchivedKeyAlreadyOnInstance_UpdatePassesAsRawJSON_KTN108", func(t *testing.T) {
		t.Cleanup(resetDB)
		customer := newCustomer(t)
		license := newLicense(t)
		field := seedInstanceMetadataField(t, "legacy_region", "Legacy Region",
			map[string]any{"type": "string"}, 0)

		createPayload := schema.Instance{
			Name:             "instance-legacy-keeper",
			Description:      "legacy metadata",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			Metadata:         map[string]any{"legacy_region": "eu-west-1"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", createPayload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		created := commonfixture.AssertJSONResponse[schema.Instance](t, resp, fiber.StatusCreated)

		archiveInstanceMetadataField(t, field)

		updatePayload := schema.Instance{
			Name:             "instance-legacy-keeper",
			Description:      "legacy metadata still accepted as raw json",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			Metadata:         map[string]any{"legacy_region": 42},
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+created.Slug, updatePayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusNoContent, resp.StatusCode)
	})

	// Pins the two-tier PUT contract on Instance.
	t.Run("PUTContract_ActiveKeyOmitted_IsDeleted_KTN62", func(t *testing.T) {
		t.Cleanup(resetDB)
		customer := newCustomer(t)
		license := newLicense(t)
		seedInstanceMetadataField(t, "region", "Region",
			map[string]any{"type": "string"}, 0)

		createPayload := schema.Instance{
			Name:             "instance-active-omit",
			Description:      "before",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			Metadata:         map[string]any{"region": "eu-west-1"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", createPayload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		created := commonfixture.AssertJSONResponse[schema.Instance](t, resp, fiber.StatusCreated)

		// PUT with empty metadata — `region` is active, must be removed.
		updatePayload := schema.Instance{
			Name:             "instance-active-omit",
			Description:      "after",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			Metadata:         map[string]any{},
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+created.Slug, updatePayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		req = commonfixture.NewJSONRequest(t, "GET", "/api/instances/"+created.Slug, nil)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		fetched := commonfixture.AssertJSONResponse[schema.Instance](t, resp, fiber.StatusOK)
		_, present := fetched.Metadata["region"]
		assert.False(t, present, "active metadata key must be deleted by a PUT that omits it")
	})

	// The omit-preserve case for Instance was
	// not covered before. Pin it here.
	t.Run("WhenPUTOmitsArchivedKey_ServerPreservesIt_Instance_KTN108", func(t *testing.T) {
		t.Cleanup(resetDB)
		customer := newCustomer(t)
		license := newLicense(t)
		field := seedInstanceMetadataField(t, "legacy_region", "Legacy Region",
			map[string]any{"type": "string"}, 0)

		createPayload := schema.Instance{
			Name:             "instance-omit-preserve",
			Description:      "before archive",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			Metadata:         map[string]any{"legacy_region": "eu-west-1"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", createPayload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		created := commonfixture.AssertJSONResponse[schema.Instance](t, resp, fiber.StatusCreated)
		archiveInstanceMetadataField(t, field)

		// PUT omits the archived key — server must re-inject it.
		updatePayload := schema.Instance{
			Name:             "instance-omit-preserve-after",
			Description:      "after archive",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			Metadata:         map[string]any{},
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+created.Slug, updatePayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		req = commonfixture.NewJSONRequest(t, "GET", "/api/instances/"+created.Slug, nil)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		fetched := commonfixture.AssertJSONResponse[schema.Instance](t, resp, fiber.StatusOK)
		assert.Equal(t, "eu-west-1", fetched.Metadata["legacy_region"],
			"archived key must survive a PUT that omits it (server-side merge)")
	})

	// An archived key's value stays freely modifiable, Instance side.
	t.Run("PUTContract_ArchivedKeyValueChangedFreely_Instance_KTN108", func(t *testing.T) {
		t.Cleanup(resetDB)
		customer := newCustomer(t)
		license := newLicense(t)
		field := seedInstanceMetadataField(t, "legacy_region", "Legacy Region",
			map[string]any{"type": "string"}, 0)

		createPayload := schema.Instance{
			Name:             "instance-archived-mutate",
			Description:      "before archive",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			Metadata:         map[string]any{"legacy_region": "eu-west-1"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", createPayload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		created := commonfixture.AssertJSONResponse[schema.Instance](t, resp, fiber.StatusCreated)
		archiveInstanceMetadataField(t, field)

		updatePayload := schema.Instance{
			Name:             "instance-archived-mutate",
			Description:      "after archive",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			Metadata:         map[string]any{"legacy_region": 999}, // type change OK on archived
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+created.Slug, updatePayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		req = commonfixture.NewJSONRequest(t, "GET", "/api/instances/"+created.Slug, nil)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		fetched := commonfixture.AssertJSONResponse[schema.Instance](t, resp, fiber.StatusOK)
		assert.EqualValues(t, 999, fetched.Metadata["legacy_region"],
			"archived key value should be freely updatable as raw jsonb on Instance too")
	})

	t.Run("WhenIntroducingArchivedKeyOnInstance_Returns422_KTN108", func(t *testing.T) {
		t.Cleanup(resetDB)
		customer := newCustomer(t)
		license := newLicense(t)
		field := seedInstanceMetadataField(t, "legacy_region", "Legacy Region",
			map[string]any{"type": "string"}, 0)
		archiveInstanceMetadataField(t, field)

		createPayload := schema.Instance{
			Name:             "instance-no-legacy",
			Description:      "no legacy metadata",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			Metadata:         map[string]any{},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", createPayload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		created := commonfixture.AssertJSONResponse[schema.Instance](t, resp, fiber.StatusCreated)

		updatePayload := schema.Instance{
			Name:             "instance-no-legacy",
			Description:      "tries to introduce legacy metadata",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			Metadata:         map[string]any{"legacy_region": "eu-west-1"},
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+created.Slug, updatePayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})
}

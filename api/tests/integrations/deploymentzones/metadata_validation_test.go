package deploymentzones_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// seedMetadataField inserts a metadata_field row for the default test org
// and returns the created row (so callers can archive it via its ID).
// Inline rather than in fixture_test.go to keep this file's scope explicit.
func seedMetadataField(t *testing.T, key, label string, schema map[string]any, displayOrder int32) metadatafieldsdb.MetadataField {
	t.Helper()
	schemaBytes, err := json.Marshal(schema)
	require.NoError(t, err)
	row, err := metadatafieldsdb.New(testServer.Dependencies.DB).InsertMetadataField(context.Background(), metadatafieldsdb.InsertMetadataFieldParams{
		OrganizationID: testDb.DefaultData.OrganizationID,
		ResourceType:   metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
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

// archiveMetadataField marks a previously seeded field as archived, leaving
// any values already stored in resource.metadata jsonb columns intact.
func archiveMetadataField(t *testing.T, id uuid.UUID) {
	t.Helper()
	_, err := metadatafieldsdb.New(testServer.Dependencies.DB).ArchiveMetadataField(context.Background(), metadatafieldsdb.ArchiveMetadataFieldParams{
		ID:             id,
		OrganizationID: testDb.DefaultData.OrganizationID,
		UserID:         testDb.DefaultData.UserID,
	})
	require.NoError(t, err)
	validator.ClearCache() // see seedMetadataField
}

// TestCreateDeploymentZoneMetadataValidation covers the create path: when
// the org has declared a typed metadata schema (DZ is strict), creating a DZ
// with metadata that violates it must yield 422.
func TestCreateDeploymentZoneMetadataValidation(t *testing.T) {
	resetDB := func() { require.NoError(t, testDb.Reset()) }

	t.Run("WhenMetadataMatchesSchema_Creates201", func(t *testing.T) {
		t.Cleanup(resetDB)
		seedMetadataField(t, "tier", "Tier",
			map[string]any{"type": "string", "enum": []any{"production", "staging"}}, 0)

		payload := schema.DeploymentZone{
			Name:        "dz-1",
			Type:        "cloud",
			Description: "ok",
			Metadata:    map[string]any{"tier": "production"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusCreated, resp.StatusCode)
	})

	t.Run("WhenMetadataValueOutOfEnum_Returns422", func(t *testing.T) {
		t.Cleanup(resetDB)
		seedMetadataField(t, "tier", "Tier",
			map[string]any{"type": "string", "enum": []any{"production", "staging"}}, 0)

		payload := schema.DeploymentZone{
			Name:        "dz-2",
			Type:        "cloud",
			Description: "bad",
			Metadata:    map[string]any{"tier": "WRONG_VALUE"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenArchivedKeyAlreadyOnResource_UpdatePassesAsRawJSON_KTN108", func(t *testing.T) {
		t.Cleanup(resetDB)
		// 1. Declare a field, create a DZ that uses it.
		field := seedMetadataField(t, "legacy_tier", "Legacy Tier",
			map[string]any{"type": "string"}, 0)
		createPayload := schema.DeploymentZone{
			Name: "dz-archived-keeper", Type: "cloud", Description: "ok",
			Metadata: map[string]any{"legacy_tier": "gold"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", createPayload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		created := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusCreated)

		// 2. Archive the field — value stays on the DZ.
		archiveMetadataField(t, field.ID)

		// 3. PATCH the DZ keeping the archived key — must still pass.
		updatePayload := schema.DeploymentZone{
			Name: "dz-archived-keeper-renamed", Type: "cloud", Description: "still good",
			Metadata: map[string]any{"legacy_tier": "gold"},
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+created.Slug, updatePayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusNoContent, resp.StatusCode)
	})

	t.Run("WhenPUTOmitsArchivedKey_ServerPreservesIt_KTN108", func(t *testing.T) {
		t.Cleanup(resetDB)
		// 1. Declare + create + archive — DZ now carries `legacy_tier`.
		field := seedMetadataField(t, "legacy_tier", "Legacy Tier",
			map[string]any{"type": "string"}, 0)
		createPayload := schema.DeploymentZone{
			Name: "dz-omit-preserve", Type: "cloud", Description: "before",
			Metadata: map[string]any{"legacy_tier": "gold"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", createPayload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		created := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusCreated)
		archiveMetadataField(t, field.ID)

		// 2. PUT WITHOUT the archived key (naïve client) — must still pass
		// AND the archived key must remain on the resource.
		updatePayload := schema.DeploymentZone{
			Name: "dz-omit-preserve-after", Type: "cloud", Description: "after",
			Metadata: map[string]any{}, // empty — would full-replace
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+created.Slug, updatePayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		// 3. GET back and assert legacy_tier survived.
		req = commonfixture.NewJSONRequest(t, "GET", "/api/deployment-zones/"+created.Slug, nil)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		fetched := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusOK)
		assert.Equal(t, "gold", fetched.Metadata["legacy_tier"],
			"archived key should survive a PUT that omitted it (server-side merge)")
	})

	t.Run("WhenIntroducingArchivedKey_Returns422_KTN108", func(t *testing.T) {
		t.Cleanup(resetDB)
		// Declare + archive a field with no DZ using it.
		field := seedMetadataField(t, "legacy_tier", "Legacy Tier",
			map[string]any{"type": "string"}, 0)
		archiveMetadataField(t, field.ID)

		// Create a DZ WITHOUT the archived key (handler is hit AFTER archive
		// → archived-key-introduction would block the create too, so seed an
		// empty metadata first).
		createPayload := schema.DeploymentZone{
			Name: "dz-no-legacy", Type: "cloud", Description: "fresh", Metadata: map[string]any{},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", createPayload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		created := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusCreated)

		// PATCH trying to ADD the archived key — must be rejected 422.
		updatePayload := schema.DeploymentZone{
			Name: "dz-no-legacy", Type: "cloud", Description: "trying to introduce",
			Metadata: map[string]any{"legacy_tier": "gold"},
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+created.Slug, updatePayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	// Pins the two-tier PUT contract.
	// Active keys omitted by a PUT must be DELETED (standard PUT semantics).
	// Archived keys omitted by a PUT must be PRESERVED (server-side
	// merge). The two rules live under the same verb; this test pins them
	// against each other so a future regression that drops the merge OR
	// changes the active-key semantics fails loudly.
	t.Run("PUTContract_ActiveKeyOmitted_IsDeleted_KTN62", func(t *testing.T) {
		t.Cleanup(resetDB)
		seedMetadataField(t, "tier", "Tier",
			map[string]any{"type": "string", "enum": []any{"production", "staging"}}, 0)

		createPayload := schema.DeploymentZone{
			Name: "dz-active-omit", Type: "cloud", Description: "before",
			Metadata: map[string]any{"tier": "production"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", createPayload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		created := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusCreated)

		// PUT with empty metadata — `tier` is active, so it must be removed.
		updatePayload := schema.DeploymentZone{
			Name: "dz-active-omit-after", Type: "cloud", Description: "after",
			Metadata: map[string]any{},
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+created.Slug, updatePayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		// GET back and assert the active key is gone.
		req = commonfixture.NewJSONRequest(t, "GET", "/api/deployment-zones/"+created.Slug, nil)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		fetched := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusOK)
		_, present := fetched.Metadata["tier"]
		assert.False(t, present, "active metadata key must be deleted by a PUT that omits it")
	})

	// An archived key's value stays freely modifiable.
	// Unit test covers this in validator/validate_test.go; the integration
	// test below pins the same rule end-to-end through the HTTP API.
	t.Run("PUTContract_ArchivedKeyValueChangedFreely_KTN108", func(t *testing.T) {
		t.Cleanup(resetDB)
		field := seedMetadataField(t, "legacy_tier", "Legacy Tier",
			map[string]any{"type": "string"}, 0)

		createPayload := schema.DeploymentZone{
			Name: "dz-archived-mutate", Type: "cloud", Description: "before",
			Metadata: map[string]any{"legacy_tier": "gold"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", createPayload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		created := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusCreated)
		archiveMetadataField(t, field.ID)

		// PUT with a *different type* for the archived key — archived keys
		// behave as raw jsonb so no type re-check applies.
		updatePayload := schema.DeploymentZone{
			Name: "dz-archived-mutate", Type: "cloud", Description: "after",
			Metadata: map[string]any{"legacy_tier": 42},
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+created.Slug, updatePayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		req = commonfixture.NewJSONRequest(t, "GET", "/api/deployment-zones/"+created.Slug, nil)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		fetched := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusOK)
		// JSON numerics deserialize as float64 — assert by value, not type.
		assert.EqualValues(t, 42, fetched.Metadata["legacy_tier"],
			"archived key value should be freely updatable as raw jsonb")
	})

	// Every field archived falls back to the no-contract behaviour.
	// Once every declared field is archived, the org reverts to "no
	// contract" semantics — arbitrary keys become accepted just like a
	// fresh org with no MetadataField rows. Archived leftovers still
	// follow the introduce-vs-keep rule.
	t.Run("WhenAllFieldsArchived_FallbackToNoContract_KTN108", func(t *testing.T) {
		t.Cleanup(resetDB)
		// One active field only — archived right after.
		field := seedMetadataField(t, "region", "Region",
			map[string]any{"type": "string", "enum": []any{"a", "b"}}, 0)
		archiveMetadataField(t, field.ID)

		// Brand new arbitrary key, no prior resource → should pass even in
		// strict mode because there's no active contract left.
		createPayload := schema.DeploymentZone{
			Name: "dz-no-contract", Type: "cloud", Description: "ok",
			Metadata: map[string]any{"untyped_key": "free_value"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", createPayload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusCreated, resp.StatusCode,
			"strict DZ should fall back to no-contract once all fields are archived")
	})

	// An empty schema, then the first field declared:
	// updated by the S1 idempotent guard.
	//
	// State transition pinned:
	//
	//  - Pre-contract: no MetadataField rows → empty-schema fallback →
	//    arbitrary metadata is accepted on create.
	//  - Admin declares the first MetadataField with a DIFFERENT key.
	//  - A PUT that doesn't touch metadata (same map deep-equal) skips
	//    revalidation thanks to the idempotent guard — no surprise 422
	//    just because the schema landscape changed underneath. This is the
	//    "gradual migration" UX: editing the resource's name doesn't
	//    force a metadata cleanup.
	//  - A PUT that DOES change metadata (different keys/values) is
	//    revalidated and 422s if the new payload doesn't satisfy the
	//    contract. This is where the admin is forced to migrate.
	t.Run("FirstFieldDeclared_IdempotentPUTPasses_ChangedPUT422s_KTN62", func(t *testing.T) {
		t.Cleanup(resetDB)

		// 1. No MetadataField rows → empty-schema fallback.
		createPayload := schema.DeploymentZone{
			Name: "dz-pre-contract", Type: "cloud", Description: "before contract",
			Metadata: map[string]any{"random_legacy_key": "any_value"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", createPayload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		created := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusCreated)

		// 2. Admin declares the first MetadataField.
		seedMetadataField(t, "tier", "Tier",
			map[string]any{"type": "string", "enum": []any{"gold", "silver"}}, 0)

		// 3. Idempotent PUT — metadata unchanged — should pass.
		samePayload := schema.DeploymentZone{
			Name: "dz-pre-contract", Type: "cloud", Description: "name & description bumped, metadata unchanged",
			Metadata: map[string]any{"random_legacy_key": "any_value"},
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+created.Slug, samePayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusNoContent, resp.StatusCode,
			"a no-op metadata PUT must NOT 422 just because the schema changed — gradual migration")

		// 4. PUT that actually changes the metadata to a payload that
		//    violates the new contract — should 422.
		changedPayload := schema.DeploymentZone{
			Name: "dz-pre-contract", Type: "cloud", Description: "metadata changed",
			Metadata: map[string]any{"random_legacy_key": "different_value"},
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+created.Slug, changedPayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode,
			"a real metadata change must be revalidated against the active contract")

		// 5. PUT that adopts the new contract should pass.
		validPayload := schema.DeploymentZone{
			Name: "dz-pre-contract", Type: "cloud", Description: "migrated",
			Metadata: map[string]any{"tier": "gold"},
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+created.Slug, validPayload)
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusNoContent, resp.StatusCode)
	})

	t.Run("WhenMetadataHasUnknownKey_Returns422_StrictMode", func(t *testing.T) {
		t.Cleanup(resetDB)
		seedMetadataField(t, "tier", "Tier",
			map[string]any{"type": "string", "enum": []any{"production"}}, 0)

		payload := schema.DeploymentZone{
			Name:        "dz-3",
			Type:        "cloud",
			Description: "extra key",
			Metadata: map[string]any{
				"tier":    "production",
				"untyped": "should be rejected",
			},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})
}

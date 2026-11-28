package entitlements_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	entitlementEvents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlement"
	entitlementsdb "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// createWithScope POSTs an entitlement and returns the raw response.
func createWithScope(t *testing.T, app *fiber.App, body map[string]any) *http.Response {
	t.Helper()
	// The contract makes description required, and null is a value it takes.
	if _, ok := body["description"]; !ok {
		body["description"] = nil
	}
	resp, err := app.Test(commonfixture.NewJSONRequest(t, http.MethodPost, "/api/entitlements", body), fiber.TestConfig{})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

// storedLimitScope reads the column, which holds a value for every row.
func storedLimitScope(t *testing.T, slug string) string {
	t.Helper()
	var scope string
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT limit_scope::text FROM entitlement WHERE slug = $1 AND organization_id = $2`,
		slug, testDb.DefaultData.OrganizationID).Scan(&scope))
	return scope
}

func TestCreateEntitlement_LimitScope(t *testing.T) {
	t.Run("WhenLimitScopeResource_CreatesPerResourceEntitlement", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		resp := createWithScope(t, testServer.App, map[string]any{
			"name": "Sources per competitor", "type": "NUMBER", "aggregationMethod": "SUM", "limitScope": "RESOURCE",
		})

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Equal(t, ptr.To(schema.LimitScopeResource), created.LimitScope)
		require.Equal(t, "RESOURCE", storedLimitScope(t, created.Slug))

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetEntitlement(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, ptr.To(schema.LimitScopeResource), stored.LimitScope)

		// The webhook payload is the entitlement, so the scope reaches subscribers.
		var payload schema.Entitlement
		found := false
		for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
			if event.EventName == entitlementEvents.EntitlementCreated.Name {
				require.NoError(t, json.Unmarshal(event.Data, &payload))
				found = true
			}
		}
		require.True(t, found)
		assert.Equal(t, ptr.To(schema.LimitScopeResource), payload.LimitScope)
	})

	t.Run("WhenLimitScopeOmitted_DefaultsToInstance", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		resp := createWithScope(t, testServer.App, map[string]any{"name": "Seats", "type": "NUMBER"})

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Equal(t, ptr.To(schema.LimitScopeInstance), created.LimitScope, "no existing client changes: a NUMBER counts per instance")
		require.Equal(t, "INSTANCE", storedLimitScope(t, created.Slug))
	})

	t.Run("WhenLimitScopeIsInstance_IsAccepted", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		resp := createWithScope(t, testServer.App, map[string]any{"name": "Seats", "type": "NUMBER", "limitScope": "INSTANCE"})

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Equal(t, ptr.To(schema.LimitScopeInstance), created.LimitScope)
	})

	t.Run("WhenLimitScopeIsUnknown_Returns422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		resp := createWithScope(t, testServer.App, map[string]any{"name": "Seats", "type": "NUMBER", "limitScope": "TENANT"})

		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode, "the schema's enum refuses it before the handler")
	})

	for _, typ := range []string{"BOOLEAN", "CONFIG"} {
		for _, scope := range []string{"RESOURCE", "INSTANCE"} {
			t.Run("WhenLimitScope"+scope+"OnA"+typ+"_Returns400", func(t *testing.T) {
				t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

				resp := createWithScope(t, testServer.App, map[string]any{"name": "Feature", "type": typ, "limitScope": scope})

				problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, resp, fiber.StatusBadRequest)
				require.Equal(t, "CreateEntitlement.InvalidLimitScope", problem.Code)
			})
		}
	}

	t.Run("WhenABooleanOmitsTheScope_ItCarriesNone", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		resp := createWithScope(t, testServer.App, map[string]any{"name": "Feature", "type": "BOOLEAN"})

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Nil(t, created.LimitScope, "the API says nothing of a scope for a type that has no counter")
		require.Equal(t, "INSTANCE", storedLimitScope(t, created.Slug), "the column holds the default, which is never exposed")
	})

	t.Run("WhenAnAICreditPoolIsPerResource_Returns422", func(t *testing.T) {
		aiServer := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aitest.Flags(true)})
		t.Cleanup(func() { require.NoError(t, aiServer.Close()) })
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		resp := createWithScope(t, aiServer.App, map[string]any{"name": "AI Pool", "type": "NUMBER_AI_CREDIT", "limitScope": "RESOURCE"})

		problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, resp, fiber.StatusUnprocessableEntity)
		require.Equal(t, "CreateEntitlement.AiCreditPoolRequiresInstanceScope", problem.Code)
	})

	t.Run("WhenAnAICreditPoolIsPerInstance_ItReadsInstance", func(t *testing.T) {
		aiServer := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformFlags: aitest.Flags(true)})
		t.Cleanup(func() { require.NoError(t, aiServer.Close()) })
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		resp := createWithScope(t, aiServer.App, map[string]any{"name": "AI Pool", "type": "NUMBER_AI_CREDIT", "limitScope": "INSTANCE"})

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Equal(t, ptr.To(schema.LimitScopeInstance), created.LimitScope)
	})

	t.Run("TheDatabaseKeepsResourceToNumber", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		_, err := testServer.Dependencies.DB.Exec(t.Context(), `
			INSERT INTO entitlement (name, slug, type, organization_id, limit_scope)
			VALUES ('Flag', 'flag-per-resource', 'BOOLEAN', $1, 'RESOURCE')`, testDb.DefaultData.OrganizationID)

		require.Error(t, err)
		require.Contains(t, err.Error(), "entitlement_limit_scope_resource_check")
	})
}

func TestGetEntitlement_LimitScope(t *testing.T) {
	t.Run("WhenReadOneOrAList_TheNumberFamilyCarriesItAndTheOthersDoNot", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		perResource := commonfixture.AssertJSONResponse[schema.Entitlement](t,
			createWithScope(t, testServer.App, map[string]any{"name": "Per resource", "type": "NUMBER", "limitScope": "RESOURCE"}), fiber.StatusCreated)
		perInstance := commonfixture.AssertJSONResponse[schema.Entitlement](t,
			createWithScope(t, testServer.App, map[string]any{"name": "Per instance", "type": "NUMBER"}), fiber.StatusCreated)
		flag := commonfixture.AssertJSONResponse[schema.Entitlement](t,
			createWithScope(t, testServer.App, map[string]any{"name": "Flag", "type": "BOOLEAN"}), fiber.StatusCreated)

		one, err := testServer.App.Test(commonfixture.NewJSONRequest(t, http.MethodGet, "/api/entitlements/"+perResource.Slug, nil), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, one.Body)
		require.Equal(t, ptr.To(schema.LimitScopeResource), commonfixture.AssertJSONResponse[schema.Entitlement](t, one, fiber.StatusOK).LimitScope)

		list, err := testServer.App.Test(commonfixture.NewJSONRequest(t, http.MethodGet, "/api/entitlements", nil), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, list.Body)
		page := commonfixture.AssertJSONResponse[struct {
			Items []schema.Entitlement `json:"items"`
		}](t, list, fiber.StatusOK)
		scopes := map[string]*schema.LimitScope{}
		for _, item := range page.Items {
			scopes[item.Slug] = item.LimitScope
		}
		require.Equal(t, ptr.To(schema.LimitScopeResource), scopes[perResource.Slug])
		require.Equal(t, ptr.To(schema.LimitScopeInstance), scopes[perInstance.Slug])
		require.Contains(t, scopes, flag.Slug)
		require.Nil(t, scopes[flag.Slug])
	})
}

func TestUpdateEntitlement_LimitScope(t *testing.T) {
	put := func(t *testing.T, slug string, body map[string]any) *http.Response {
		t.Helper()
		if _, ok := body["description"]; !ok {
			body["description"] = nil
		}
		resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, http.MethodPut, "/api/entitlements/"+slug, body), fiber.TestConfig{})
		require.NoError(t, err)
		t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
		return resp
	}
	create := func(t *testing.T, scope string) schema.Entitlement {
		t.Helper()
		body := map[string]any{"name": "Entitlement", "type": "NUMBER", "limitScope": scope}
		return commonfixture.AssertJSONResponse[schema.Entitlement](t, createWithScope(t, testServer.App, body), fiber.StatusCreated)
	}

	t.Run("WhenLimitScopeChanges_Returns400ImmutableLimitScope", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		for _, from := range []string{"RESOURCE", "INSTANCE"} {
			to := map[string]string{"RESOURCE": "INSTANCE", "INSTANCE": "RESOURCE"}[from]
			entitlement := create(t, from)

			resp := put(t, entitlement.Slug, map[string]any{"name": "Renamed", "aggregationMethod": "SUM", "limitScope": to})

			problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, resp, fiber.StatusBadRequest)
			require.Equal(t, "UpdateEntitlement.ImmutableLimitScope", problem.Code)
			require.Equal(t, from, storedLimitScope(t, entitlement.Slug), "an entitlement keeps the scope it was created with")
		}
	})

	t.Run("WhenLimitScopeIsEchoed_Updates", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		entitlement := create(t, "RESOURCE")

		resp := put(t, entitlement.Slug, map[string]any{"name": "Renamed", "aggregationMethod": "SUM", "limitScope": "RESOURCE"})

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetEntitlement(t.Context(), entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, "Renamed", stored.Name)
		require.Equal(t, ptr.To(schema.LimitScopeResource), stored.LimitScope)
	})

	t.Run("WhenLimitScopeIsOmitted_KeepsIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		entitlement := create(t, "RESOURCE")

		resp := put(t, entitlement.Slug, map[string]any{"name": "Renamed", "aggregationMethod": "SUM"})

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode, "omission is accepted, as it is for type")
		require.Equal(t, "RESOURCE", storedLimitScope(t, entitlement.Slug))
	})

	t.Run("WhenALimitScopeIsSentForABoolean_Returns400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		flag := commonfixture.AssertJSONResponse[schema.Entitlement](t,
			createWithScope(t, testServer.App, map[string]any{"name": "Flag", "type": "BOOLEAN"}), fiber.StatusCreated)

		resp := put(t, flag.Slug, map[string]any{"name": "Flag", "limitScope": "RESOURCE"})

		problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, resp, fiber.StatusBadRequest)
		require.Equal(t, "UpdateEntitlement.InvalidLimitScope", problem.Code)
	})
}

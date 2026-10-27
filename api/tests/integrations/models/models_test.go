package models_test

import (
	"encoding/json"
	"net/http"
	"os"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/modules/models/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

var (
	testDB *tests.TestDatabase
	server *tests.TestServer
)

func TestMain(m *testing.M) {
	var err error
	testDB, err = tests.NewTestDatabase()
	if err != nil {
		panic(err)
	}
	server = tests.NewTestServer(testDB, tests.TestServerOptions{ConfigOverride: func(cfg *config.Config) { cfg.AIUsage.Enabled = true }})
	code := m.Run()
	testDB.TearDown()
	os.Exit(code)
}

func model(slug string) schema.Model {
	return schema.Model{Name: "Synthetic model", Slug: slug, Vendor: "synthetic", Modality: schema.Text, Status: schema.Active, VendorCosts: schema.VendorCosts{Currency: "USD"}, ExternalIDs: []string{"provider-" + slug}}
}

func request(t *testing.T, method, path string, body any) *http.Response {
	t.Helper()
	response, err := server.App.Test(commonfixture.NewJSONRequest(t, method, "/api"+path, body), fiber.TestConfig{})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, response.Body) })
	return response
}

func TestCatalogueLifecycleAndEvents(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDB.Reset()) })
	input := model("test-model")
	cost := "0.000000000123"
	input.VendorCosts.PerInputToken = &cost
	created := commonfixture.AssertJSONResponse[schema.Model](t, request(t, "POST", "/models", input), http.StatusCreated)
	require.Equal(t, input.ExternalIDs, created.ExternalIDs)
	require.Equal(t, &cost, created.VendorCosts.PerInputToken)
	read := commonfixture.AssertJSONResponse[schema.Model](t, request(t, "GET", "/models/test-model", nil), http.StatusOK)
	require.Equal(t, created.ID, read.ID)
	input.Status = schema.Deprecated
	input.ExternalIDs = []string{"updated-id"}
	updated := commonfixture.AssertJSONResponse[schema.Model](t, request(t, "PUT", "/models/test-model", input), http.StatusOK)
	require.Equal(t, schema.Deprecated, updated.Status)
	require.Equal(t, input.ExternalIDs, updated.ExternalIDs)
	input.Status = schema.Archived
	commonfixture.AssertJSONResponse[schema.Model](t, request(t, "PUT", "/models/test-model", input), http.StatusOK)
	input.Status = schema.Active
	commonfixture.AssertJSONResponse[schema.Model](t, request(t, "PUT", "/models/test-model", input), http.StatusOK)
	page := commonfixture.AssertJSONResponse[pagination.Page[*schema.Model]](t, request(t, "GET", "/models?status=ACTIVE&vendor=synthetic&modality=TEXT", nil), http.StatusOK)
	require.Len(t, page.Items, 1)
	events := commonfixture.ListOutboxEvents(t, server.Dependencies.DB, testDB.DefaultData.OrganizationID)
	var snapshot schema.ModelUpdated
	found := false
	for _, event := range events {
		if event.EventName == "MODEL_UPDATED" {
			require.NoError(t, json.Unmarshal(event.Data, &snapshot))
			require.NotNil(t, snapshot.Before)
			require.NotNil(t, snapshot.After)
			found = true
		}
	}
	require.True(t, found)
	require.Equal(t, http.StatusNoContent, request(t, "DELETE", "/models/test-model", nil).StatusCode)
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, request(t, "GET", "/models/test-model", nil), http.StatusNotFound)
	require.Equal(t, "GetModel.NotFound", problem.Code)
}

func TestCatalogueConflictsAndImmutables(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDB.Reset()) })
	first := model("first-model")
	first.ExternalIDs = []string{"future-model"}
	commonfixture.AssertJSONResponse[schema.Model](t, request(t, "POST", "/models", first), http.StatusCreated)
	for _, tc := range []struct {
		name, method, path, code string
		body                     schema.Model
		status                   int
	}{
		{"slug exists", "POST", "/models", "CreateModel.SlugConflict", first, http.StatusConflict},
		{"reverse external collision", "POST", "/models", "CreateModel.ExternalIdConflict", model("future-model"), http.StatusConflict},
		{"external shadows slug", "POST", "/models", "CreateModel.ExternalIdConflict", schema.Model{Name: "Other", Slug: "other-model", Vendor: "v", Status: schema.Active, VendorCosts: schema.VendorCosts{Currency: "USD"}, Modality: schema.Text, ExternalIDs: []string{"first-model"}}, http.StatusConflict},
		{"slug immutable", "PUT", "/models/first-model", "UpdateModel.ImmutableSlug", model("changed-model"), http.StatusUnprocessableEntity},
		{"modality immutable", "PUT", "/models/first-model", "UpdateModel.ImmutableModality", schema.Model{Name: "First", Slug: "first-model", Vendor: "v", Status: schema.Active, ExternalIDs: []string{}, VendorCosts: schema.VendorCosts{Currency: "USD"}, Modality: schema.Image}, http.StatusUnprocessableEntity},
	} {
		t.Run(tc.name, func(t *testing.T) {
			problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, request(t, tc.method, tc.path, tc.body), tc.status)
			require.Equal(t, tc.code, problem.Code)
		})
	}
}

func TestCataloguePagination(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDB.Reset()) })
	for _, slug := range []string{"model-one", "model-two", "model-three"} {
		commonfixture.AssertJSONResponse[schema.Model](t, request(t, "POST", "/models", model(slug)), http.StatusCreated)
	}
	page := commonfixture.AssertJSONResponse[pagination.Page[*schema.Model]](t, request(t, "GET", "/models?limit=2", nil), http.StatusOK)
	require.Len(t, page.Items, 2)
	require.True(t, page.HasMore)
	require.NotNil(t, page.NextCursor)
	next := commonfixture.AssertJSONResponse[pagination.Page[*schema.Model]](t, request(t, "GET", "/models?limit=2&cursor="+*page.NextCursor, nil), http.StatusOK)
	require.Len(t, next.Items, 1)
	require.False(t, next.HasMore)
	require.NotEqual(t, page.Items[0].ID, next.Items[0].ID)
	require.NotEqual(t, page.Items[1].ID, next.Items[0].ID)
}

func TestCatalogueGraphQLAndNoReadEvents(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDB.Reset()) })
	commonfixture.AssertJSONResponse[schema.Model](t, request(t, "POST", "/models", model("graphql-model")), http.StatusCreated)
	before := commonfixture.ListOutboxEvents(t, server.Dependencies.DB, testDB.DefaultData.OrganizationID)
	response := request(t, "POST", "/graphql", map[string]string{"query": `{ models(status: ACTIVE) { slug vendor externalIds status } }`})
	result := commonfixture.AssertJSONResponse[struct {
		Data struct {
			Models []schema.Model `json:"models"`
		} `json:"data"`
		Errors []any `json:"errors"`
	}](t, response, http.StatusOK)
	require.Empty(t, result.Errors)
	require.Len(t, result.Data.Models, 1)
	require.Equal(t, "graphql-model", result.Data.Models[0].Slug)
	require.Len(t, commonfixture.ListOutboxEvents(t, server.Dependencies.DB, testDB.DefaultData.OrganizationID), len(before))
}

func TestCatalogueRuleReferencesPreventDeletion(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDB.Reset()) })
	created := commonfixture.AssertJSONResponse[schema.Model](t, request(t, "POST", "/models", model("referenced-model")), http.StatusCreated)
	_, err := server.Dependencies.DB.Exec(t.Context(), `
		WITH f AS (INSERT INTO license_family (organization_id, slug) VALUES ($1, 'ai-family') RETURNING id),
		l AS (INSERT INTO license (organization_id, family_id, name, slug, description, type, lifecycle_state)
			SELECT $1, id, 'AI license', 'ai-license', '', 'PAID', 'DRAFT' FROM f RETURNING id),
		e AS (INSERT INTO entitlement (organization_id, name, slug, type, aggregation_method)
			VALUES ($1, 'Credits', 'credits', 'NUMBER_AI_CREDIT', 'SUM') RETURNING id)
		INSERT INTO credit_conversion_rule (organization_id, license_id, entitlement_id, model_id, rate_per_request, status, created_by_id, updated_by_id)
		SELECT $1, l.id, e.id, $2, 1, 'ARCHIVED', $3, $3 FROM l, e`, testDB.DefaultData.OrganizationID, created.ID, testDB.DefaultData.UserID)
	require.NoError(t, err)
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, request(t, "DELETE", "/models/referenced-model", nil), http.StatusConflict)
	require.Equal(t, "DeleteModel.InUse", problem.Code)
}

func TestCatalogueScopeGates(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDB.Reset()) })
	restricted := tests.NewTestServer(testDB, tests.TestServerOptions{Scopes: []string{"read:instances"}})
	for _, tc := range []struct {
		method, path string
		body         any
	}{
		{"GET", "/api/models", nil},
		{"POST", "/api/models", model("forbidden-model")},
		{"POST", "/api/graphql", map[string]string{"query": `{ models { slug } }`}},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			response, err := restricted.App.Test(commonfixture.NewJSONRequest(t, tc.method, tc.path, tc.body), fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, response.Body)
			problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, response, http.StatusForbidden)
			require.Equal(t, "Auth.MissingScope", problem.Code)
		})
	}
}

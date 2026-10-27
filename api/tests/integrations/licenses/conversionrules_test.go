package licenses_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	fixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func ruleRequest(t *testing.T, method, path string, body any) *http.Response {
	t.Helper()
	r, err := testServer.App.Test(fixture.NewJSONRequest(t, method, "/api"+path, body), fiber.TestConfig{})
	require.NoError(t, err)
	t.Cleanup(func() { fixture.MustCloseBody(t, r.Body) })
	return r
}

func ruleBody() map[string]any {
	return map[string]any{"entitlementSlug": "ai-credits", "rates": map[string]any{"perRequest": "0.0000000001", "perInputToken": "1", "perCachedInputToken": "2", "perCacheWriteToken": "3", "perOutputToken": "4", "perUnit": "5", "perSecond": "6"}, "minimumCreditsPerRequest": "0.000001", "maximumCreditsPerRequest": "999999999999.999999", "chargeOnError": "PROVIDER_ERROR_ONLY"}
}

func ruleFixture(t *testing.T) string {
	previous := testServer
	enabled := tests.NewTestServer(testDb, tests.TestServerOptions{ConfigOverride: func(cfg *config.Config) { cfg.AIUsage.Enabled = true }})
	testServer = enabled
	t.Cleanup(func() { testServer = previous; require.NoError(t, enabled.Close()) })
	t.Helper()
	l := newLicenses(t, 1)[0]
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO entitlement (organization_id,name,slug,type,aggregation_method) VALUES ($1,'AI credits','ai-credits','NUMBER_AI_CREDIT','SUM')`, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	fixture.AssertJSONResponse[map[string]any](t, ruleRequest(t, "POST", "/models", map[string]any{"name": "Model", "slug": "ai-model", "vendor": "synthetic", "modality": "TEXT", "status": "ACTIVE"}), 201)
	return "/licenses/" + l.Slug + "/conversion-rules"
}

func createRule(t *testing.T, path string, b map[string]any) schema.ConversionRule {
	t.Helper()
	return fixture.AssertJSONResponse[schema.ConversionRule](t, ruleRequest(t, "POST", path, b), 201)
}

func ruleProblem(t *testing.T, method, path string, b any, status int, code string) {
	t.Helper()
	p := fixture.AssertJSONResponse[apierrors.Problem](t, ruleRequest(t, method, path, b), status)
	require.Equal(t, code, p.Code)
}

func TestConversionRulesLifecycle(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	path := ruleFixture(t)
	b := ruleBody()
	b["modelSlug"] = "ai-model"
	b["requestType"] = "COMPLETION"
	created := createRule(t, path, b)
	require.False(t, created.GrantedByLicense)
	require.Equal(t, "0.0000000001", *created.Rates.PerRequest)
	require.Equal(t, "999999999999.999999", *created.MaximumCreditsPerRequest)
	idpath := path + "/" + created.ID.String()
	read := fixture.AssertJSONResponse[schema.ConversionRule](t, ruleRequest(t, "GET", idpath, nil), 200)
	require.Equal(t, created, read)
	list := fixture.AssertJSONResponse[[]schema.ConversionRule](t, ruleRequest(t, "GET", path+"?entitlementSlug=ai-credits&modelSlug=ai-model", nil), 200)
	require.Len(t, list, 1)
	newLicenseEntitlementWithThreshold(t, "test-license-1", "ai-credits", 10)
	read = fixture.AssertJSONResponse[schema.ConversionRule](t, ruleRequest(t, "GET", idpath, nil), 200)
	require.True(t, read.GrantedByLicense)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `DELETE FROM license_entitlement WHERE entitlement_id=(SELECT id FROM entitlement WHERE slug='ai-credits' AND organization_id=$1)`, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	read = fixture.AssertJSONResponse[schema.ConversionRule](t, ruleRequest(t, "GET", idpath, nil), 200)
	require.False(t, read.GrantedByLicense)
	newLicenseEntitlementWithThreshold(t, "test-license-1", "ai-credits", 10)
	read = fixture.AssertJSONResponse[schema.ConversionRule](t, ruleRequest(t, "GET", idpath, nil), 200)
	require.True(t, read.GrantedByLicense)
	require.Equal(t, created.ID, read.ID)
	update := map[string]any{"rates": map[string]any{"perUnit": "0"}, "chargeOnError": "ALWAYS"}
	updated := fixture.AssertJSONResponse[schema.ConversionRule](t, ruleRequest(t, "PUT", idpath, update), 200)
	require.Equal(t, created.ID, updated.ID)
	require.Nil(t, updated.Rates.PerRequest)
	require.Equal(t, "0", *updated.Rates.PerUnit)
	events := fixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
	found := false
	for _, e := range events {
		if e.EventName == "LICENSE_CONVERSION_RULE_UPDATED" {
			var snapshot schema.ConversionRuleUpdated
			require.NoError(t, json.Unmarshal(e.Data, &snapshot))
			require.Equal(t, created.Rates, snapshot.Before.Rates)
			require.Equal(t, updated.Rates, snapshot.After.Rates)
			found = true
		}
	}
	require.True(t, found)
	require.Equal(t, 204, ruleRequest(t, "DELETE", idpath, nil).StatusCode)
	archived := fixture.AssertJSONResponse[schema.ConversionRule](t, ruleRequest(t, "GET", idpath, nil), 200)
	require.Equal(t, 204, ruleRequest(t, "DELETE", idpath, nil).StatusCode)
	again := fixture.AssertJSONResponse[schema.ConversionRule](t, ruleRequest(t, "GET", idpath, nil), 200)
	require.Equal(t, archived.UpdatedAt, again.UpdatedAt)
	count := 0
	for _, e := range fixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if e.EventName == "LICENSE_CONVERSION_RULE_ARCHIVED" {
			count++
		}
	}
	require.Equal(t, 1, count)
	require.Empty(t, fixture.AssertJSONResponse[[]schema.ConversionRule](t, ruleRequest(t, "GET", path, nil), 200))
	require.Len(t, fixture.AssertJSONResponse[[]schema.ConversionRule](t, ruleRequest(t, "GET", path+"?status=ARCHIVED", nil), 200), 1)
	ruleProblem(t, "PUT", idpath, update, 409, "UpdateConversionRule.Archived")
	replacement := createRule(t, path, b)
	require.NotEqual(t, created.ID, replacement.ID)
}

func TestConversionRulesIdentityAndValidation(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	path := ruleFixture(t)
	for _, model := range []bool{false, true} {
		for _, typed := range []bool{false, true} {
			b := ruleBody()
			if model {
				b["modelSlug"] = "ai-model"
			}
			if typed {
				b["requestType"] = "COMPLETION"
			}
			r := createRule(t, path, b)
			ruleProblem(t, "POST", path, b, 409, "CreateConversionRule.Conflict")
			idpath := path + "/" + r.ID.String()
			for key, value := range map[string]any{"entitlementSlug": "other", "modelSlug": "other", "requestType": "AUDIO"} {
				u := map[string]any{"rates": map[string]any{"perRequest": "1"}, key: value}
				codes := map[string]string{"entitlementSlug": "ImmutableEntitlement", "modelSlug": "ImmutableModel", "requestType": "ImmutableRequestType"}
				ruleProblem(t, "PUT", idpath, u, 422, "UpdateConversionRule."+codes[key])
			}
			if model {
				ruleProblem(t, "PUT", idpath, map[string]any{"rates": map[string]any{"perRequest": "1"}, "modelSlug": nil}, 422, "UpdateConversionRule.ImmutableModel")
			}
			if typed {
				ruleProblem(t, "PUT", idpath, map[string]any{"rates": map[string]any{"perRequest": "1"}, "requestType": nil}, 422, "UpdateConversionRule.ImmutableRequestType")
			}
		}
	}
	for _, rates := range []map[string]any{{}, {"perSecond": "100000000"}, {"perRequest": "0.00000000001"}, {"perUnit": "-1"}} {
		b := ruleBody()
		b["rates"] = rates
		code := "UNPROCESSABLE"
		if len(rates) == 0 {
			code = "NoRate"
		}
		ruleProblem(t, "POST", path, b, 422, map[string]string{"NoRate": "CreateConversionRule.NoRate", "UNPROCESSABLE": "UNPROCESSABLE"}[code])
	}
	b := ruleBody()
	b["minimumCreditsPerRequest"] = "10"
	b["maximumCreditsPerRequest"] = "1"
	ruleProblem(t, "POST", path, b, 422, "CreateConversionRule.InvalidPricing")
	b = ruleBody()
	b["chargeOnError"] = "WRONG"
	ruleProblem(t, "POST", path, b, 422, "UNPROCESSABLE")
	for status, code := range map[string]string{"DEPRECATED": "ModelDeprecated", "ARCHIVED": "ModelArchived"} {
		_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE model SET status=$1 WHERE organization_id=$2`, status, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		b = ruleBody()
		b["modelSlug"] = "ai-model"
		ruleProblem(t, "POST", path, b, 422, "CreateConversionRule."+code)
	}
}

func TestConversionRulesTenancyAndScopes(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	path := ruleFixture(t)
	r := createRule(t, path, ruleBody())
	idpath := path + "/" + r.ID.String()
	neighbor := newNeighbourOrganization(t)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO entitlement (organization_id,name,slug,type,aggregation_method) VALUES ($1,'Private','private-pool','NUMBER_AI_CREDIT','SUM');`, neighbor)
	require.NoError(t, err)
	b := ruleBody()
	b["entitlementSlug"] = "private-pool"
	ruleProblem(t, "POST", path, b, 404, "CreateConversionRule.EntitlementNotFound")
	ruleProblem(t, "GET", "/licenses/missing/conversion-rules/"+r.ID.String(), nil, 404, "GetConversionRule.LicenseNotFound")
	ruleProblem(t, "GET", path+"/"+uuid.New().String(), nil, 404, "GetConversionRule.NotFound")

	_, err = testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO model (organization_id,name,slug,vendor,modality,created_by_id,updated_by_id) VALUES ($1,'Private','private-model','synthetic','TEXT',$2,$2)`, neighbor, testDb.DefaultData.UserID)
	require.NoError(t, err)
	b = ruleBody()
	b["modelSlug"] = "private-model"
	ruleProblem(t, "POST", path, b, 404, "CreateConversionRule.ModelNotFound")
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO license (organization_id,family_id,name,slug,description,type,lifecycle_state) SELECT organization_id,family_id,'Other','other-license','','PAID','DRAFT' FROM license WHERE slug='test-license-1' AND organization_id=$1`, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	for method, code := range map[string]string{"GET": "GetConversionRule", "PUT": "UpdateConversionRule", "DELETE": "ArchiveConversionRule"} {
		ruleProblem(t, method, "/licenses/other-license/conversion-rules/"+r.ID.String(), ruleBody(), 404, code+".NotFound")
	}
	_, err = testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO entitlement (organization_id,name,slug,type,aggregation_method) VALUES ($1,'Number','ordinary-number','NUMBER','SUM')`, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	b = ruleBody()
	b["entitlementSlug"] = "ordinary-number"
	ruleProblem(t, "POST", path, b, 422, "CreateConversionRule.EntitlementNotAiCreditPool")
	server := tests.NewTestServer(testDb, tests.TestServerOptions{Scopes: []string{scope.Read(scope.Customers)}})
	t.Cleanup(func() { require.NoError(t, server.Close()) })
	for _, target := range []string{path, idpath} {
		resp, err := server.App.Test(fixture.NewJSONRequest(t, "GET", "/api"+target, nil), fiber.TestConfig{})
		require.NoError(t, err)
		fixture.AssertJSONResponse[apierrors.Problem](t, resp, 403)
	}
	resp, err := server.App.Test(fixture.NewJSONRequest(t, "POST", "/api/graphql", map[string]any{"query": `{ licenses { items { conversionRules { id } } } }`}), fiber.TestConfig{})
	require.NoError(t, err)
	problem := fixture.AssertJSONResponse[apierrors.Problem](t, resp, 403)
	require.Equal(t, "Auth.MissingScope", problem.Code)
}

func TestConversionRulesGraphQLFilters(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	path := ruleFixture(t)
	archived := createRule(t, path, ruleBody())
	require.Equal(t, 204, ruleRequest(t, "DELETE", path+"/"+archived.ID.String(), nil).StatusCode)
	active := createRule(t, path, ruleBody())
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `INSERT INTO license (organization_id,family_id,name,slug,description,type,lifecycle_state) SELECT organization_id,family_id,'Empty','empty-license','','PAID','DRAFT' FROM license WHERE slug='test-license-1' AND organization_id=$1`, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	before := len(fixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID))
	answer := fixture.AssertJSONResponse[struct {
		Data struct {
			License struct{ All, Active, Archived []schema.ConversionRule }
		}
		Errors []any
	}](t, ruleRequest(t, "POST", "/graphql", map[string]any{"query": `{ license(slug:"test-license-1") { all:conversionRules { id rates { perRequest } } active:conversionRules(status:ACTIVE) { id } archived:conversionRules(status:ARCHIVED) { id } } }`}), 200)
	require.Empty(t, answer.Errors)
	require.Len(t, answer.Data.License.All, 2)
	require.Len(t, answer.Data.License.Active, 1)
	require.Len(t, answer.Data.License.Archived, 1)
	require.Equal(t, active.ID, answer.Data.License.Active[0].ID)
	require.Equal(t, archived.ID, answer.Data.License.Archived[0].ID)
	require.Len(t, fixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID), before)
	grouped := fixture.AssertJSONResponse[struct {
		Data struct {
			Licenses struct {
				Items []struct {
					Slug            string
					ConversionRules []schema.ConversionRule
				}
			}
		}
		Errors []any
	}](t, ruleRequest(t, "POST", "/graphql", map[string]any{"query": `{ licenses { items { slug conversionRules(status:ACTIVE) { id } } } }`}), 200)
	require.Empty(t, grouped.Errors)
	require.Len(t, grouped.Data.Licenses.Items, 2)
	for _, item := range grouped.Data.Licenses.Items {
		if item.Slug == "empty-license" {
			require.NotNil(t, item.ConversionRules)
			require.Empty(t, item.ConversionRules)
		} else {
			require.Len(t, item.ConversionRules, 1)
			require.Equal(t, active.ID, item.ConversionRules[0].ID)
		}
	}

	for _, scopes := range [][]string{{scope.Read(scope.Customers)}, {scope.Read(scope.Licenses)}} {
		server := tests.NewTestServer(testDb, tests.TestServerOptions{Scopes: scopes})
		t.Cleanup(func() { require.NoError(t, server.Close()) })
		for _, method := range []string{"POST", "PUT", "DELETE"} {
			target := idpathFor(path, active.ID)
			if method == "POST" {
				target = path
			}
			resp, err := server.App.Test(fixture.NewJSONRequest(t, method, "/api"+target, ruleBody()), fiber.TestConfig{})
			require.NoError(t, err)
			fixture.AssertJSONResponse[apierrors.Problem](t, resp, 403)
		}
	}
}
func idpathFor(path string, id uuid.UUID) string { return path + "/" + id.String() }

func TestArchivedConversionRuleStillRequiresMembership(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	path := ruleFixture(t)
	r := createRule(t, path, ruleBody())
	target := path + "/" + r.ID.String()
	require.Equal(t, 204, ruleRequest(t, "DELETE", target, nil).StatusCode)
	_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE user_on_organization SET deleted_at=now() WHERE organization_id=$1 AND user_id=$2`, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID)
	require.NoError(t, err)
	ruleProblem(t, "DELETE", target, nil, 403, "CurrentUser.NotInOrganization")
}

func TestConversionRulePricesRemainMutableAcrossLicenseLifecycle(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	path := ruleFixture(t)
	for _, status := range []string{"DRAFT", "PUBLISHED", "ARCHIVED"} {
		_, err := testServer.Dependencies.DB.Exec(t.Context(), `UPDATE license SET lifecycle_state=$1 WHERE slug='test-license-1' AND organization_id=$2`, status, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		r := createRule(t, path, ruleBody())
		target := path + "/" + r.ID.String()
		u := map[string]any{"modelSlug": nil, "requestType": nil, "rates": map[string]any{"perRequest": "1", "perUnit": nil}}
		fixture.AssertJSONResponse[schema.ConversionRule](t, ruleRequest(t, "PUT", target, u), 200)
		require.Equal(t, 204, ruleRequest(t, "DELETE", target, nil).StatusCode)
	}
}

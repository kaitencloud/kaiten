package instances_test

import (
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// The report path and the history reads were built and tested apart. These
// tests cross them over HTTP only: catalogue and rule through their own
// operations, a reserve and a commit, then both listings.

func aiHTTP(t *testing.T, app *fiber.App, method, path string, body any) *http.Response {
	t.Helper()
	if app == nil {
		app = testServer.App
	}
	resp, err := app.Test(commonfixture.NewJSONRequest(t, method, "/api"+path, body), fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func organizationPage(t *testing.T, app *fiber.App, query url.Values) instanceschema.OrganizationAiInferencePage {
	t.Helper()
	return commonfixture.AssertJSONResponse[instanceschema.OrganizationAiInferencePage](t, aiHTTP(t, app, http.MethodGet, "/usage/inferences?"+query.Encode(), nil), http.StatusOK)
}

func TestAIChargeIsExplainedByTheHistoryOverHTTP(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance := newInstances(t, 1)[0]
	pool := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
	assignAIPoolToLicense(t, instance.LicenseSlug, pool.Slug, 100, 0)
	commonfixture.AssertJSONResponse[map[string]any](t, aiHTTP(t, nil, http.MethodPost, "/models", map[string]any{
		"name": "Explained", "slug": "explained-model", "vendor": "synthetic", "modality": "TEXT", "status": "ACTIVE",
		"vendorCosts": map[string]any{"perInputToken": "0.000003", "perOutputToken": "0.000015", "currency": "USD"},
	}), http.StatusCreated)
	rulesPath := "/licenses/" + instance.LicenseSlug + "/conversion-rules"
	rule := commonfixture.AssertJSONResponse[licenseschema.ConversionRule](t, aiHTTP(t, nil, http.MethodPost, rulesPath, map[string]any{
		"entitlementSlug": pool.Slug, "modelSlug": "explained-model", "requestType": "COMPLETION",
		"rates":                    map[string]any{"perInputToken": "0.001", "perOutputToken": "0.003"},
		"minimumCreditsPerRequest": "0", "maximumCreditsPerRequest": "50", "chargeOnError": "NEVER",
	}), http.StatusCreated)

	// Reserve 1000 in + 800 out = 1 + 2.4 credits; commit 1200 in + 900 out =
	// 1.2 + 2.7 credits, with the provider's own figure beside it.
	reserve := map[string]any{"type": "ai_usage", "phase": "reserve", "transactionId": "explained", "model": "explained-model", "requestType": "COMPLETION", "usage": map[string]any{"inputTokens": 1000, "outputTokens": 800}}
	reserved := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, reserve), http.StatusOK)
	require.Equal(t, "3.4", *reserved.AI.Credits.Reserved)
	require.Equal(t, &instanceschema.AiUsageRule{ID: rule.ID, Specificity: aicredit.ExactTyped}, reserved.AI.Rule)
	commit := map[string]any{"type": "ai_usage", "phase": "commit", "transactionId": "explained", "requestStatus": "SUCCESS", "usage": map[string]any{"inputTokens": 1200, "outputTokens": 900}, "vendorCost": "0.0175"}
	charged := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, commit), http.StatusOK)
	require.Equal(t, "3.9", *charged.AI.Credits.Charged)
	require.Equal(t, &instanceschema.AiUsageRule{ID: rule.ID, Specificity: aicredit.ExactTyped}, charged.AI.Rule)
	require.Empty(t, charged.AI.Warnings)

	read := func() instanceschema.AiInference {
		page := historyPage(t, instance.Slug, pool.Slug, url.Values{})
		require.Len(t, page.Items, 1)
		return page.Items[0]
	}
	row := read()
	require.Equal(t, "COMMITTED", row.Status)
	require.Equal(t, "explained-model", *row.ModelSlug)
	require.True(t, *row.Authorized)
	require.Equal(t, rule.ID.String(), *row.ConversionRuleID)
	require.Equal(t, instanceschema.AiCredits{Reserved: ptr.To("3.4"), Computed: ptr.To("3.9"), Charged: ptr.To("3.9")}, row.Credits)
	require.Equal(t, &instanceschema.AiInferencePricing{
		RuleID: rule.ID, Specificity: aicredit.ExactTyped,
		Rates:                    instanceschema.AiInferenceRates{PerInputToken: ptr.To("0.001"), PerOutputToken: ptr.To("0.003")},
		MinimumCreditsPerRequest: "0", MaximumCreditsPerRequest: ptr.To("50"), ChargeOnError: aicredit.Never,
	}, row.Pricing)
	require.Equal(t, instance.LicenseID.String(), *row.LicenseID)
	require.Equal(t, instance.LicenseSlug, *row.LicenseSlug)
	require.Equal(t, []string{}, row.Warnings)
	// The link to the journal: the pair's counter when the commit was counted.
	require.Equal(t, counterReportSeq(t, instance.ID, pool.ID), *row.ReportSeq)
	journal := ledgerRows(t, instance.ID, pool.ID)
	require.Len(t, journal, 1)
	require.Equal(t, journal[0].ReportSeq, *row.ReportSeq)
	// 1200 x 0.000003 + 900 x 0.000015 = 0.0036 + 0.0135.
	require.Equal(t, &instanceschema.AiVendorCost{Reported: ptr.To("0.0175"), Computed: ptr.To("0.0171"), Currency: "USD"}, row.VendorCost)

	// The rule is edited through its own operation. The record keeps the
	// rates it was charged at; the rule itself now says otherwise.
	edited := commonfixture.AssertJSONResponse[licenseschema.ConversionRule](t, aiHTTP(t, nil, http.MethodPut, rulesPath+"/"+rule.ID.String(), map[string]any{
		"rates": map[string]any{"perInputToken": "0.5"}, "minimumCreditsPerRequest": "1", "chargeOnError": "ALWAYS",
	}), http.StatusOK)
	require.Equal(t, "0.5", *edited.Rates.PerInputToken)
	require.Nil(t, edited.Rates.PerOutputToken)
	require.Equal(t, row, read())

	// The organization listing shows the same record, with where it belongs.
	organization := organizationPage(t, nil, url.Values{})
	require.Len(t, organization.Items, 1)
	require.Equal(t, row, organization.Items[0].AiInference)
	require.Equal(t, instance.Slug, *organization.Items[0].InstanceSlug)
	require.Equal(t, pool.Slug, *organization.Items[0].EntitlementSlug)

	// A retried commit is the stored answer, rule included.
	replay := aiReport(t, instance.Slug, pool.Slug, commit)
	require.Equal(t, "true", replay.Header.Get("Idempotent-Replayed"))
	require.Equal(t, charged, commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, replay, http.StatusOK))

	// The next call is priced and snapshotted with the rule as edited:
	// 10 x 0.5 credits, no maximum any more.
	next := map[string]any{"type": "ai_usage", "phase": "commit", "transactionId": "after-the-edit", "model": "explained-model", "requestType": "COMPLETION", "requestStatus": "SUCCESS", "usage": map[string]any{"inputTokens": 10}}
	repriced := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, next), http.StatusOK)
	require.Equal(t, "5", *repriced.AI.Credits.Charged)
	page := historyPage(t, instance.Slug, pool.Slug, url.Values{"transactionId": {"after-the-edit"}})
	require.Len(t, page.Items, 1)
	require.Equal(t, &instanceschema.AiInferencePricing{
		RuleID: rule.ID, Specificity: aicredit.ExactTyped,
		Rates:                    instanceschema.AiInferenceRates{PerInputToken: ptr.To("0.5")},
		MinimumCreditsPerRequest: "1", ChargeOnError: aicredit.Always,
	}, page.Items[0].Pricing)
	require.Equal(t, &instanceschema.AiVendorCost{Computed: ptr.To("0.00003"), Currency: "USD"}, page.Items[0].VendorCost)
	require.Greater(t, *page.Items[0].ReportSeq, *row.ReportSeq)
}

// A commit for a model the catalogue does not know is recorded by the report
// path and must be findable afterwards: model= is the only handle on it.
func TestAIUnknownModelCommitIsListedAndFoundByModelOverHTTP(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, naming(aiUsageBody("commit", "known", 2), "lifecycle-model")), http.StatusOK)
	unknown := naming(aiUsageBody("commit", "ghost", 2), "ghost-model-v9")
	unknown["vendorCost"] = "1.5"
	denied := commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, unknown), http.StatusOK)
	require.False(t, *denied.AI.Authorized)
	require.Nil(t, denied.AI.Rule)

	for name, query := range map[string]url.Values{
		"by the model as sent":        {"model": {"ghost-model-v9"}},
		"by the verdict":              {"authorized": {"false"}},
		"by the model and its status": {"model": {"ghost-model-v9"}, "authorized": {"false"}, "status": {"COMMITTED"}, "requestType": {"COMPLETION"}},
	} {
		t.Run(name, func(t *testing.T) {
			page := historyPage(t, instance.Slug, pool.Slug, query)
			require.Equal(t, []string{"ghost"}, transactionIDs(page.Items))
			row := page.Items[0]
			require.False(t, *row.Authorized)
			require.Equal(t, "UNKNOWN_MODEL", *row.DenialReason)
			require.Equal(t, "ghost-model-v9", row.Model)
			require.Nil(t, row.ModelSlug)
			require.Nil(t, row.Pricing)
			require.Nil(t, row.ConversionRuleID)
			require.Equal(t, []string{instanceschema.AiWarningUnknownModel}, row.Warnings)
			require.Equal(t, "0", *row.Credits.Charged)
			require.Nil(t, row.ReportSeq, "nothing was counted")
			require.Equal(t, instance.LicenseSlug, *row.LicenseSlug)
			require.Equal(t, &instanceschema.AiVendorCost{Reported: ptr.To("1.5"), Currency: "USD"}, row.VendorCost)

			organization := organizationPage(t, nil, query)
			require.Len(t, organization.Items, 1)
			require.Equal(t, row, organization.Items[0].AiInference)
		})
	}
	require.Equal(t, []string{"known"}, transactionIDs(historyPage(t, instance.Slug, pool.Slug, url.Values{"authorized": {"true"}}).Items))
	require.Empty(t, historyPage(t, instance.Slug, pool.Slug, url.Values{"modelSlug": {"ghost-model-v9"}}).Items, "an unknown model has no catalogue slug")
	require.Empty(t, historyPage(t, instance.Slug, pool.Slug, url.Values{"model": {"ghost-model"}}).Items, "model is matched exactly")
}

// naming names the model on a commit that closes no reservation.
func naming(value map[string]any, model string) map[string]any {
	value["model"], value["requestType"] = model, "COMPLETION"
	return value
}

func TestAIOrganizationInferencesOverHTTP(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instances := newInstances(t, 2)
	poolA := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
	poolB := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
	model := newHistoryModel(t, "org-model")
	now := time.Now().UTC()
	at := func(minutes int) time.Time { return now.Add(-time.Duration(minutes) * time.Minute) }
	insertHistoryRow(t, historyRow{Instance: instances[0].ID, Entitlement: poolA.ID, TransactionID: "i0-a", ReportedAt: at(10), ModelRef: "org-model", ModelID: &model, Authorized: ptr.To(true)})
	insertHistoryRow(t, historyRow{Instance: instances[0].ID, Entitlement: poolB.ID, TransactionID: "i0-b", ReportedAt: at(9), ModelRef: "unknown", RequestType: "EMBEDDING", Authorized: ptr.To(false)})
	insertHistoryRow(t, historyRow{Instance: instances[1].ID, Entitlement: poolA.ID, TransactionID: "i1-a", ReportedAt: at(8), ModelRef: "org-model", ModelID: &model})
	insertHistoryRow(t, historyRow{Instance: instances[1].ID, Entitlement: poolB.ID, TransactionID: "i1-b", ReportedAt: at(7), ModelRef: "org-model", ModelID: &model, Authorized: ptr.To(true)})
	neighbour := newNeighbourOrganization(t)
	foreign := newInstanceIn(t, neighbour)
	insertHistoryRow(t, historyRow{Org: neighbour, Instance: foreign.ID, Entitlement: uuid.New(), TransactionID: "neighbour", ReportedAt: at(5), Authorized: ptr.To(true)})

	ids := func(t *testing.T, query url.Values) []string {
		t.Helper()
		return organizationTransactionIDs(organizationPage(t, nil, query).Items)
	}

	t.Run("newest first, with the instance and the pool of each", func(t *testing.T) {
		page := organizationPage(t, nil, url.Values{})
		require.Equal(t, []string{"i1-b", "i1-a", "i0-b", "i0-a"}, organizationTransactionIDs(page.Items))
		require.False(t, page.HasMore)
		require.Nil(t, page.NextCursor)
		require.Equal(t, instances[1].Slug, *page.Items[0].InstanceSlug)
		require.Equal(t, poolB.Slug, *page.Items[0].EntitlementSlug)
		require.Equal(t, "RESERVED", page.Items[1].Status)
	})

	t.Run("filters", func(t *testing.T) {
		require.Equal(t, []string{"i0-b", "i0-a"}, ids(t, url.Values{"instanceSlug": {instances[0].Slug}}))
		require.Equal(t, []string{"i1-a", "i0-a"}, ids(t, url.Values{"entitlementSlug": {poolA.Slug}}))
		require.Equal(t, []string{"i1-b", "i0-a"}, ids(t, url.Values{"authorized": {"true"}}))
		require.Equal(t, []string{"i0-b"}, ids(t, url.Values{"authorized": {"false"}}))
		require.Equal(t, []string{"i1-b", "i1-a", "i0-a"}, ids(t, url.Values{"modelSlug": {"org-model"}}))
		require.Equal(t, []string{"i0-b"}, ids(t, url.Values{"model": {"unknown"}}))
		require.Equal(t, []string{"i0-b"}, ids(t, url.Values{"requestType": {"EMBEDDING"}}))
		require.Equal(t, []string{"i1-a"}, ids(t, url.Values{"status": {"RESERVED"}}))
		require.Equal(t, []string{"i1-b"}, ids(t, url.Values{"transactionId": {"i1-b"}}))
		require.Equal(t, []string{"i1-b"}, ids(t, url.Values{"instanceSlug": {instances[1].Slug}, "entitlementSlug": {poolB.Slug}, "authorized": {"true"}, "modelSlug": {"org-model"}, "requestType": {"COMPLETION"}}))
		require.Equal(t, []string{"i0-b", "i0-a"}, ids(t, url.Values{"to": {at(8).Add(-30 * time.Second).Format(time.RFC3339Nano)}}))
		for _, slug := range []string{foreign.Slug, "no-such-slug"} {
			require.Empty(t, ids(t, url.Values{"instanceSlug": {slug}}))
			require.Empty(t, ids(t, url.Values{"entitlementSlug": {slug}}))
		}
	})

	t.Run("pagination", func(t *testing.T) {
		query := url.Values{"limit": {"3"}}
		first := organizationPage(t, nil, query)
		require.Equal(t, []string{"i1-b", "i1-a", "i0-b"}, organizationTransactionIDs(first.Items))
		require.True(t, first.HasMore)
		query.Set("cursor", *first.NextCursor)
		second := organizationPage(t, nil, query)
		require.Equal(t, []string{"i0-a"}, organizationTransactionIDs(second.Items))
		require.False(t, second.HasMore)

		filtered := url.Values{"limit": {"1"}, "entitlementSlug": {poolA.Slug}}
		first = organizationPage(t, nil, filtered)
		require.Equal(t, []string{"i1-a"}, organizationTransactionIDs(first.Items))
		filtered.Set("cursor", *first.NextCursor)
		require.Equal(t, []string{"i0-a"}, organizationTransactionIDs(organizationPage(t, nil, filtered).Items))
	})

	t.Run("what the request cannot use", func(t *testing.T) {
		problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiHTTP(t, nil, http.MethodGet, "/usage/inferences?cursor=garbage", nil), http.StatusUnprocessableEntity)
		require.Equal(t, "ListOrganizationAiInferences.InvalidCursor", problem.Code)
		inverted := url.Values{"from": {now.Format(time.RFC3339)}, "to": {now.Add(-time.Hour).Format(time.RFC3339)}}
		problem = commonfixture.AssertJSONResponse[apierrors.Problem](t, aiHTTP(t, nil, http.MethodGet, "/usage/inferences?"+inverted.Encode(), nil), http.StatusUnprocessableEntity)
		require.Equal(t, "ListOrganizationAiInferences.InvalidRange", problem.Code)
		for _, query := range []string{"authorized=maybe", "status=OPEN", "requestType=CHAT", "limit=0", "limit=501", "from=yesterday"} {
			require.Equal(t, http.StatusUnprocessableEntity, aiHTTP(t, nil, http.MethodGet, "/usage/inferences?"+query, nil).StatusCode, query)
		}
	})

	t.Run("read:instances is required", func(t *testing.T) {
		for _, scopes := range [][]string{{scope.Read(scope.Licenses)}, {scope.Read(scope.Models)}} {
			other := tests.NewTestServer(testDb, tests.TestServerOptions{Scopes: scopes, PlatformFlags: aitest.Flags(true)})
			t.Cleanup(func() { require.NoError(t, other.Close()) })
			require.Equal(t, http.StatusForbidden, aiHTTP(t, other.App, http.MethodGet, "/usage/inferences", nil).StatusCode, scopes)
		}
		writer := tests.NewTestServer(testDb, tests.TestServerOptions{Scopes: []string{scope.Write(scope.Instances)}, PlatformFlags: aitest.Flags(true)})
		t.Cleanup(func() { require.NoError(t, writer.Close()) })
		require.Len(t, organizationPage(t, writer.App, url.Values{}).Items, 4, "write implies read")
	})

	t.Run("a tenant reads only its own", func(t *testing.T) {
		theirs := tests.NewTestServer(testDb, tests.TestServerOptions{OrganizationID: &neighbour, PlatformFlags: aitest.Flags(true)})
		t.Cleanup(func() { require.NoError(t, theirs.Close()) })
		page := organizationPage(t, theirs.App, url.Values{})
		require.Equal(t, []string{"neighbour"}, organizationTransactionIDs(page.Items))
		require.Equal(t, foreign.Slug, *page.Items[0].InstanceSlug)
		for _, query := range []url.Values{{"instanceSlug": {instances[0].Slug}}, {"entitlementSlug": {poolA.Slug}}, {"transactionId": {"i0-a"}}, {"modelSlug": {"org-model"}}} {
			require.Empty(t, organizationPage(t, theirs.App, query).Items, query)
		}
	})

	t.Run("the AI gate closes it like the per-pool read", func(t *testing.T) {
		off := tests.NewTestServer(testDb, tests.TestServerOptions{})
		t.Cleanup(func() { require.NoError(t, off.Close()) })
		for _, path := range []string{"/usage/inferences", "/instances/" + instances[0].Slug + "/entitlements/" + poolA.Slug + "/usage/inferences"} {
			problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiHTTP(t, off.App, http.MethodGet, path, nil), http.StatusForbidden)
			require.Equal(t, "AIUsage.Disabled", problem.Code, path)
		}
	})
}

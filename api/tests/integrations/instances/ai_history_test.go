package instances_test

import (
	"crypto/sha256"
	"net/http"
	"net/url"
	"strconv"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/aihistory"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/listorganizationaiinferences"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage/aitest"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// historyRow is one ai_inference row written straight to the database, so
// these tests pin the read side on rows whose every column they choose; the
// rows the report path writes are read back in ai_explain_http_test.go. A nil
// Authorized writes a RESERVED operation; otherwise a COMMITTED one, charged
// 2 credits when authorized.
type historyRow struct {
	Org, Instance, Entitlement uuid.UUID
	TransactionID              string
	ReportedAt                 time.Time
	ModelRef                   string
	ModelID                    *uuid.UUID
	RequestType                string
	Authorized                 *bool
	Pricing                    *string
	LicenseID                  *uuid.UUID
	Warnings                   []string
	ReportSeq                  *int64
	VendorCostReported         *string
	VendorCostComputed         *string
}

func insertHistoryRow(t *testing.T, row historyRow) uuid.UUID {
	t.Helper()
	if row.Org == uuid.Nil {
		row.Org = testDb.DefaultData.OrganizationID
	}
	if row.TransactionID == "" {
		row.TransactionID = uuid.NewString()
	}
	if row.ReportedAt.IsZero() {
		row.ReportedAt = time.Now().UTC().Add(-time.Hour)
	}
	if row.ModelRef == "" {
		row.ModelRef = "history-model"
	}
	if row.RequestType == "" {
		row.RequestType = "COMPLETION"
	}
	if row.Warnings == nil {
		row.Warnings = []string{}
	}
	hash := sha256.Sum256([]byte(row.TransactionID))
	status, requestStatus, denial := "RESERVED", (*string)(nil), (*string)(nil)
	var committedAt, expiresAt *time.Time
	var reserved, charged *string
	var before, after *float64
	var commitHash []byte
	if row.Authorized == nil {
		expiresAt, reserved = ptr.To(time.Now().UTC().Add(time.Hour)), ptr.To("2")
	} else {
		status, requestStatus, committedAt, commitHash = "COMMITTED", ptr.To("SUCCESS"), &row.ReportedAt, hash[:]
		if *row.Authorized {
			charged, before, after = ptr.To("2"), ptr.To(0.0), ptr.To(2.0)
		} else {
			charged, denial = ptr.To("0"), ptr.To("UNKNOWN_MODEL")
		}
	}
	var id uuid.UUID
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `INSERT INTO ai_inference
		(organization_id,instance_id,entitlement_id,transaction_id,status,reported_at,committed_at,expires_at,model_ref,model_id,request_type,request_status,
		 authorized,denial_reason,credits_reserved,credits_charged,value_before,value_after,request_hash,commit_hash,
		 pricing,license_id,warnings,report_seq,vendor_cost_reported,vendor_cost_computed)
		VALUES ($1,$2,$3,$4,$5::ai_inference_status,$6,$7,$8,$9,$10,$11::ai_request_type,$12::ai_request_status,
		 $13,$14,$15::numeric,$16::numeric,$17,$18,$19,$20,
		 $21::jsonb,$22,$23,$24,$25::numeric,$26::numeric) RETURNING id`,
		row.Org, row.Instance, row.Entitlement, row.TransactionID, status, row.ReportedAt, committedAt, expiresAt, row.ModelRef, row.ModelID, row.RequestType, requestStatus,
		row.Authorized, denial, reserved, charged, before, after, hash[:], commitHash,
		row.Pricing, row.LicenseID, row.Warnings, row.ReportSeq, row.VendorCostReported, row.VendorCostComputed).Scan(&id))
	return id
}

func newHistoryModel(t *testing.T, slug string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `INSERT INTO model (organization_id,name,slug,vendor,modality,created_by_id,updated_by_id)
		VALUES ($1,$2,$2,'synthetic','TEXT',$3,$3) RETURNING id`, testDb.DefaultData.OrganizationID, slug, testDb.DefaultData.UserID).Scan(&id))
	return id
}

// newHistoryPair is an instance and a credit pool with no grant between them:
// history reads must not need one.
func newHistoryPair(t *testing.T) (*instanceschema.Instance, *entitlementschema.Entitlement) {
	t.Helper()
	return newInstances(t, 1)[0], newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
}

func historyPage(t *testing.T, instance, pool string, query url.Values) instanceschema.AiInferencePage {
	t.Helper()
	return commonfixture.AssertJSONResponse[instanceschema.AiInferencePage](t, aiRead(t, instance, pool, "/inferences?"+query.Encode()), http.StatusOK)
}

func transactionIDs(items []instanceschema.AiInference) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.TransactionID)
	}
	return ids
}

func TestAIHistoryReadableAfterTheGrantIsRemoved(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newAIUsagePair(t, 100)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("reserve", "granted-then-removed", 3)), http.StatusOK)
	commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, aiReport(t, instance.Slug, pool.Slug, aiUsageBody("commit", "granted-then-removed", 3)), http.StatusOK)

	remove, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "DELETE", "/api/licenses/"+instance.LicenseSlug+"/entitlements/"+pool.Slug, nil), fiber.TestConfig{Timeout: 30 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, remove.Body) })
	require.Equal(t, http.StatusNoContent, remove.StatusCode)
	var granted int
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `SELECT count(*) FROM instance_effective_entitlement WHERE instance_id=$1 AND entitlement_id=$2`, instance.ID, pool.ID).Scan(&granted))
	require.Zero(t, granted)

	history := historyPage(t, instance.Slug, pool.Slug, nil)
	require.Len(t, history.Items, 1)
	require.Equal(t, "granted-then-removed", history.Items[0].TransactionID)
	require.Equal(t, "COMMITTED", history.Items[0].Status)
	require.NotNil(t, history.Items[0].Warnings)
	reservations := commonfixture.AssertJSONResponse[instanceschema.AiReservations](t, aiRead(t, instance.Slug, pool.Slug, "/reservations"), http.StatusOK)
	require.Empty(t, reservations.Items)

	// The pool must still be a credit pool of the organization's instance.
	for _, suffix := range []string{"/inferences", "/reservations"} {
		problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiRead(t, instance.Slug, "no-such-pool", suffix), http.StatusNotFound)
		require.Equal(t, "ListAiInferences.ContextNotFound", problem.Code)
		problem = commonfixture.AssertJSONResponse[apierrors.Problem](t, aiRead(t, "no-such-instance", pool.Slug, suffix), http.StatusNotFound)
		require.Equal(t, "ListAiInferences.ContextNotFound", problem.Code)
	}
	numeric := newEntitlementWithType(t, entitlementschema.Number)
	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiRead(t, instance.Slug, numeric.Slug, "/inferences"), http.StatusNotFound)
	require.Equal(t, "ListAiInferences.ContextNotFound", problem.Code)
}

func TestAIHistoryExplainsEachOperation(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newHistoryPair(t)
	rule, gone := uuid.New(), uuid.New()
	pricing := `{"ruleId":"` + rule.String() + `","specificity":"EXACT_TYPED","rates":{"perInputToken":"0.001","perOutputToken":"0.003"},"minimumCreditsPerRequest":"0","maximumCreditsPerRequest":"50","chargeOnError":"PROVIDER_ERROR_ONLY"}`
	now := time.Now().UTC()
	insertHistoryRow(t, historyRow{
		Instance: instance.ID, Entitlement: pool.ID, TransactionID: "explained", ReportedAt: now.Add(-3 * time.Minute), Authorized: ptr.To(true),
		Pricing: &pricing, LicenseID: &instance.LicenseID, Warnings: []string{"OVERDRAWN", "MODEL_DEPRECATED"}, ReportSeq: ptr.To(int64(17)), VendorCostReported: ptr.To("0.0125"), VendorCostComputed: ptr.To("0.012"),
	})
	insertHistoryRow(t, historyRow{Instance: instance.ID, Entitlement: pool.ID, TransactionID: "licence-deleted", ReportedAt: now.Add(-2 * time.Minute), Authorized: ptr.To(true), LicenseID: &gone, VendorCostComputed: ptr.To("1")})
	insertHistoryRow(t, historyRow{Instance: instance.ID, Entitlement: pool.ID, TransactionID: "bare", ReportedAt: now.Add(-time.Minute), Authorized: ptr.To(false)})
	insertHistoryRow(t, historyRow{Instance: instance.ID, Entitlement: pool.ID, TransactionID: "open", ReportedAt: now.Add(-30 * time.Second), Warnings: []string{"MODEL_NOT_AUTHORIZED"}})

	// Raw JSON: absent must be absent, warnings must be [] rather than null.
	raw := commonfixture.AssertJSONResponse[map[string]any](t, aiRead(t, instance.Slug, pool.Slug, "/inferences"), http.StatusOK)
	items := raw["items"].([]any)
	require.Len(t, items, 4)
	byID := map[string]map[string]any{}
	for _, item := range items {
		row := item.(map[string]any)
		byID[row["transactionId"].(string)] = row
	}
	explained := byID["explained"]
	require.Equal(t, map[string]any{"ruleId": rule.String(), "specificity": "EXACT_TYPED", "rates": map[string]any{"perInputToken": "0.001", "perOutputToken": "0.003"}, "minimumCreditsPerRequest": "0", "maximumCreditsPerRequest": "50", "chargeOnError": "PROVIDER_ERROR_ONLY"}, explained["pricing"])
	require.Equal(t, instance.LicenseID.String(), explained["licenseId"])
	require.Equal(t, instance.LicenseSlug, explained["licenseSlug"])
	require.Equal(t, []any{"OVERDRAWN", "MODEL_DEPRECATED"}, explained["warnings"])
	require.EqualValues(t, 17, explained["reportSeq"])
	require.Equal(t, map[string]any{"reported": "0.0125", "computed": "0.012", "currency": "USD"}, explained["vendorCost"])

	deleted := byID["licence-deleted"]
	require.Equal(t, gone.String(), deleted["licenseId"])
	require.NotContains(t, deleted, "licenseSlug")
	require.NotContains(t, deleted, "pricing")
	require.Equal(t, map[string]any{"computed": "1", "currency": "USD"}, deleted["vendorCost"])

	bare := byID["bare"]
	for _, key := range []string{"pricing", "licenseId", "licenseSlug", "reportSeq", "vendorCost"} {
		require.NotContains(t, bare, key)
	}
	require.Equal(t, []any{}, bare["warnings"])

	reservations := commonfixture.AssertJSONResponse[map[string]any](t, aiRead(t, instance.Slug, pool.Slug, "/reservations"), http.StatusOK)
	open := reservations["items"].([]any)
	require.Len(t, open, 1)
	require.Equal(t, []any{"MODEL_NOT_AUTHORIZED"}, open[0].(map[string]any)["warnings"])

	// A reservation without warnings answers [] too, never null.
	insertHistoryRow(t, historyRow{Instance: instance.ID, Entitlement: pool.ID, TransactionID: "open-bare", ReportedAt: now.Add(-10 * time.Second)})
	reservations = commonfixture.AssertJSONResponse[map[string]any](t, aiRead(t, instance.Slug, pool.Slug, "/reservations"), http.StatusOK)
	open = reservations["items"].([]any)
	require.Len(t, open, 2)
	require.Equal(t, "open-bare", open[0].(map[string]any)["transactionId"])
	require.Equal(t, []any{}, open[0].(map[string]any)["warnings"])
}

func TestAIHistoryFilters(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newHistoryPair(t)
	model := newHistoryModel(t, "filter-model")
	now := time.Now().UTC()
	row := func(id string, minutes int, modelRef string, modelID *uuid.UUID, requestType string, authorized *bool) {
		insertHistoryRow(t, historyRow{Instance: instance.ID, Entitlement: pool.ID, TransactionID: id, ReportedAt: now.Add(-time.Duration(minutes) * time.Minute), ModelRef: modelRef, ModelID: modelID, RequestType: requestType, Authorized: authorized})
	}
	row("a", 6, "filter-model", &model, "COMPLETION", ptr.To(true))
	row("b", 5, "filter-model-2024", &model, "EMBEDDING", ptr.To(true))
	row("c", 4, "mystery-model", nil, "COMPLETION", ptr.To(false))
	row("d", 3, "filter-model", &model, "COMPLETION", nil)
	row("e", 2, "Mystery-Model", nil, "EMBEDDING", ptr.To(false))

	cases := []struct {
		name  string
		query url.Values
		want  []string
	}{
		{"none", nil, []string{"e", "d", "c", "b", "a"}},
		{"authorized", url.Values{"authorized": {"true"}}, []string{"b", "a"}},
		{"refused", url.Values{"authorized": {"false"}}, []string{"e", "c"}},
		{"catalogue model", url.Values{"modelSlug": {"filter-model"}}, []string{"d", "b", "a"}},
		{"unknown catalogue model", url.Values{"modelSlug": {"mystery-model"}}, []string{}},
		{"model as sent", url.Values{"model": {"mystery-model"}}, []string{"c"}},
		{"model as sent, alias", url.Values{"model": {"filter-model-2024"}}, []string{"b"}},
		{"request type", url.Values{"requestType": {"EMBEDDING"}}, []string{"e", "b"}},
		{"combined", url.Values{"authorized": {"true"}, "modelSlug": {"filter-model"}, "requestType": {"COMPLETION"}}, []string{"a"}},
		{"combined with status", url.Values{"status": {"RESERVED"}, "modelSlug": {"filter-model"}}, []string{"d"}},
		{"combined, empty", url.Values{"authorized": {"false"}, "modelSlug": {"filter-model"}}, []string{}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			page := historyPage(t, instance.Slug, pool.Slug, tc.query)
			require.Equal(t, tc.want, transactionIDs(page.Items))
			require.False(t, page.HasMore)
		})
	}

	for _, bad := range []url.Values{{"authorized": {"maybe"}}, {"requestType": {"CHAT"}}} {
		resp := aiRead(t, instance.Slug, pool.Slug, "/inferences?"+bad.Encode())
		require.Equal(t, http.StatusUnprocessableEntity, resp.StatusCode, bad.Encode())
	}
}

func TestAIHistoryPaginatesAFilteredListing(t *testing.T) {
	useAIForThisTest(t)
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instance, pool := newHistoryPair(t)
	base := time.Now().UTC().Add(-time.Hour).Truncate(time.Millisecond)
	var authorized []string
	for i := range 7 {
		// Two operations share each instant, so the id breaks the tie.
		at := base.Add(time.Duration(i/2) * time.Minute)
		id := "ok-" + strconv.Itoa(i)
		insertHistoryRow(t, historyRow{Instance: instance.ID, Entitlement: pool.ID, TransactionID: id, ReportedAt: at, Authorized: ptr.To(true)})
		authorized = append(authorized, id)
		insertHistoryRow(t, historyRow{Instance: instance.ID, Entitlement: pool.ID, TransactionID: "refused-" + strconv.Itoa(i), ReportedAt: at, Authorized: ptr.To(false)})
	}

	var seen []instanceschema.AiInference
	query := url.Values{"authorized": {"true"}, "limit": {"3"}}
	pages := 0
	for {
		page := historyPage(t, instance.Slug, pool.Slug, query)
		pages++
		seen = append(seen, page.Items...)
		if !page.HasMore {
			require.Nil(t, page.NextCursor)
			break
		}
		require.Len(t, page.Items, 3)
		query.Set("cursor", *page.NextCursor)
	}
	require.Equal(t, 3, pages)
	require.ElementsMatch(t, authorized, transactionIDs(seen))
	for i := 1; i < len(seen); i++ {
		require.False(t, seen[i].ReportedAt.After(seen[i-1].ReportedAt), "newest first")
		require.True(t, *seen[i].Authorized)
	}

	problem := commonfixture.AssertJSONResponse[apierrors.Problem](t, aiRead(t, instance.Slug, pool.Slug, "/inferences?cursor=garbage"), http.StatusUnprocessableEntity)
	require.Equal(t, "ListAiInferences.InvalidCursor", problem.Code)
}

// These tests drive the organization listing's use case against the real
// database, the same Execute the facade calls; its HTTP side (scope, tenant,
// gate) is in ai_explain_http_test.go.
func organizationInferences(organizationID uuid.UUID, flags aiusage.FlagReader) *listorganizationaiinferences.UseCase {
	return listorganizationaiinferences.NewUseCase(listorganizationaiinferences.Deps{
		AIPolicy:     aiusage.Policy{Flags: flags},
		UserProvider: &currentuser.StaticUserProvider{UserID: testDb.DefaultData.UserID, OrganizationID: organizationID},
		Queries:      instancedb.New(testServer.Dependencies.DB),
	})
}

func newInstanceIn(t *testing.T, organizationID uuid.UUID) *instanceschema.Instance {
	t.Helper()
	slug, err := slugutil.GenerateUnique("neighbour")
	require.NoError(t, err)
	instance, err := createinstance.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).CreateInstance(t.Context(), &createinstance.Command{
		Name: "neighbour", Slug: &slug, StartLicenseDate: time.Now(), EndLicenseDate: time.Now().AddDate(1, 0, 0),
		LicenseID: newLicenseIn(t, organizationID).ID, CustomerID: newCustomerIn(t, organizationID).ID,
	}, testDb.DefaultData.UserID, organizationID)
	require.NoError(t, err)
	return instance
}

func organizationTransactionIDs(items []instanceschema.OrganizationAiInference) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.TransactionID)
	}
	return ids
}

func TestAIOrganizationInferencesListing(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	org := testDb.DefaultData.OrganizationID
	instances := newInstances(t, 2)
	poolA := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
	poolB := newEntitlementWithPolicy(t, entitlementschema.NumberAICredit, 0)
	model := newHistoryModel(t, "org-model")
	now := time.Now().UTC()
	at := func(minutes int) time.Time { return now.Add(-time.Duration(minutes) * time.Minute) }
	gone := uuid.New()
	pricing := `{"ruleId":"` + uuid.NewString() + `","specificity":"ANY_ALL","rates":{"perRequest":"1"},"minimumCreditsPerRequest":"0","maximumCreditsPerRequest":null,"chargeOnError":"NEVER"}`
	insertHistoryRow(t, historyRow{Instance: instances[0].ID, Entitlement: poolA.ID, TransactionID: "i0-a", ReportedAt: at(10), ModelRef: "org-model", ModelID: &model, Authorized: ptr.To(true), Pricing: &pricing, LicenseID: &instances[0].LicenseID, Warnings: []string{"OVERDRAWN"}, ReportSeq: ptr.To(int64(3)), VendorCostComputed: ptr.To("0.5")})
	insertHistoryRow(t, historyRow{Instance: instances[0].ID, Entitlement: poolB.ID, TransactionID: "i0-b", ReportedAt: at(9), ModelRef: "unknown", RequestType: "EMBEDDING", Authorized: ptr.To(false)})
	insertHistoryRow(t, historyRow{Instance: instances[1].ID, Entitlement: poolA.ID, TransactionID: "i1-a", ReportedAt: at(8), ModelRef: "org-model", ModelID: &model})
	insertHistoryRow(t, historyRow{Instance: instances[1].ID, Entitlement: poolB.ID, TransactionID: "i1-b", ReportedAt: at(7), ModelRef: "org-model", ModelID: &model, Authorized: ptr.To(true)})
	insertHistoryRow(t, historyRow{Instance: gone, Entitlement: gone, TransactionID: "deleted-pair", ReportedAt: at(6), Authorized: ptr.To(true)})
	insertHistoryRow(t, historyRow{Instance: instances[0].ID, Entitlement: poolA.ID, TransactionID: "too-old", ReportedAt: now.AddDate(0, 0, -31), Authorized: ptr.To(true)})

	neighbour := newNeighbourOrganization(t)
	foreign := newInstanceIn(t, neighbour)
	insertHistoryRow(t, historyRow{Org: neighbour, Instance: foreign.ID, Entitlement: uuid.New(), TransactionID: "neighbour", ReportedAt: at(5), Authorized: ptr.To(true)})

	list := func(t *testing.T, filter aihistory.OrganizationFilter) instanceschema.OrganizationAiInferencePage {
		t.Helper()
		page, err := organizationInferences(org, aitest.Flags(true)).Execute(t.Context(), filter)
		require.NoError(t, err)
		return page
	}

	t.Run("newest first, own organization, default range", func(t *testing.T) {
		page := list(t, aihistory.OrganizationFilter{})
		require.Equal(t, []string{"deleted-pair", "i1-b", "i1-a", "i0-b", "i0-a"}, organizationTransactionIDs(page.Items))
		require.False(t, page.HasMore)
		first := page.Items[4]
		require.Equal(t, instances[0].Slug, *first.InstanceSlug)
		require.Equal(t, poolA.Slug, *first.EntitlementSlug)
		require.Equal(t, "org-model", *first.ModelSlug)
		require.Equal(t, instances[0].LicenseSlug, *first.LicenseSlug)
		require.EqualValues(t, "ANY_ALL", first.Pricing.Specificity)
		require.Equal(t, []string{"OVERDRAWN"}, first.Warnings)
		require.Equal(t, "0.5", *first.VendorCost.Computed)
		require.Equal(t, int64(3), *first.ReportSeq)
		orphan := page.Items[0]
		require.Nil(t, orphan.InstanceSlug)
		require.Nil(t, orphan.EntitlementSlug)
		require.Equal(t, []string{}, orphan.Warnings)
	})

	t.Run("explicit range", func(t *testing.T) {
		page := list(t, aihistory.OrganizationFilter{Filter: aihistory.Filter{From: now.AddDate(0, 0, -40), To: at(8).Add(-30 * time.Second)}})
		require.Equal(t, []string{"i0-b", "i0-a", "too-old"}, organizationTransactionIDs(page.Items))
	})

	t.Run("instance and pool filters", func(t *testing.T) {
		require.Equal(t, []string{"i0-b", "i0-a"}, organizationTransactionIDs(list(t, aihistory.OrganizationFilter{InstanceSlug: &instances[0].Slug}).Items))
		require.Equal(t, []string{"i1-a", "i0-a"}, organizationTransactionIDs(list(t, aihistory.OrganizationFilter{EntitlementSlug: &poolA.Slug}).Items))
		require.Equal(t, []string{"i1-b"}, organizationTransactionIDs(list(t, aihistory.OrganizationFilter{InstanceSlug: &instances[1].Slug, EntitlementSlug: &poolB.Slug}).Items))
	})

	t.Run("shared filters", func(t *testing.T) {
		require.Equal(t, []string{"deleted-pair", "i1-b", "i0-a"}, organizationTransactionIDs(list(t, aihistory.OrganizationFilter{Filter: aihistory.Filter{Authorized: ptr.To(true)}}).Items))
		require.Equal(t, []string{"i1-b", "i1-a", "i0-a"}, organizationTransactionIDs(list(t, aihistory.OrganizationFilter{Filter: aihistory.Filter{ModelSlug: ptr.To("org-model")}}).Items))
		require.Equal(t, []string{"i0-b"}, organizationTransactionIDs(list(t, aihistory.OrganizationFilter{Filter: aihistory.Filter{Model: ptr.To("unknown")}}).Items))
		require.Equal(t, []string{"i0-b"}, organizationTransactionIDs(list(t, aihistory.OrganizationFilter{Filter: aihistory.Filter{RequestType: ptr.To(instancedb.AiRequestTypeEMBEDDING)}}).Items))
		require.Equal(t, []string{"i1-b"}, organizationTransactionIDs(list(t, aihistory.OrganizationFilter{InstanceSlug: &instances[1].Slug, Filter: aihistory.Filter{Authorized: ptr.To(true), ModelSlug: ptr.To("org-model")}}).Items))
	})

	t.Run("another tenant's slug and an unknown slug match nothing", func(t *testing.T) {
		for _, slug := range []string{foreign.Slug, "no-such-instance"} {
			require.Empty(t, list(t, aihistory.OrganizationFilter{InstanceSlug: &slug}).Items)
			require.Empty(t, list(t, aihistory.OrganizationFilter{EntitlementSlug: &slug}).Items)
		}
	})

	t.Run("the neighbour sees only its own", func(t *testing.T) {
		page, err := organizationInferences(neighbour, aitest.Flags(true)).Execute(t.Context(), aihistory.OrganizationFilter{})
		require.NoError(t, err)
		require.Equal(t, []string{"neighbour"}, organizationTransactionIDs(page.Items))
		require.Equal(t, foreign.Slug, *page.Items[0].InstanceSlug)
		page, err = organizationInferences(neighbour, aitest.Flags(true)).Execute(t.Context(), aihistory.OrganizationFilter{InstanceSlug: &instances[0].Slug})
		require.NoError(t, err)
		require.Empty(t, page.Items)
	})

	t.Run("pages with a filter", func(t *testing.T) {
		filter := aihistory.OrganizationFilter{Filter: aihistory.Filter{Limit: 2, From: now.AddDate(0, 0, -40)}}
		var seen []string
		for range 10 {
			page := list(t, filter)
			seen = append(seen, organizationTransactionIDs(page.Items)...)
			if !page.HasMore {
				break
			}
			require.Len(t, page.Items, 2)
			filter.Cursor = page.NextCursor
		}
		require.Equal(t, []string{"deleted-pair", "i1-b", "i1-a", "i0-b", "i0-a", "too-old"}, seen)

		filter = aihistory.OrganizationFilter{EntitlementSlug: &poolA.Slug, Filter: aihistory.Filter{Limit: 1}}
		first := list(t, filter)
		require.True(t, first.HasMore)
		filter.Cursor = first.NextCursor
		second := list(t, filter)
		require.False(t, second.HasMore)
		require.Equal(t, []string{"i1-a", "i0-a"}, append(organizationTransactionIDs(first.Items), organizationTransactionIDs(second.Items)...))
	})

	t.Run("range and cursor validation", func(t *testing.T) {
		_, err := organizationInferences(org, aitest.Flags(true)).Execute(t.Context(), aihistory.OrganizationFilter{Filter: aihistory.Filter{From: now, To: now.Add(-time.Hour)}})
		require.Equal(t, "ListOrganizationAiInferences.InvalidRange", apierrors.GetCode(err))
		_, err = organizationInferences(org, aitest.Flags(true)).Execute(t.Context(), aihistory.OrganizationFilter{Filter: aihistory.Filter{Cursor: ptr.To("garbage")}})
		require.Equal(t, "ListOrganizationAiInferences.InvalidCursor", apierrors.GetCode(err))
	})

	t.Run("the AI gate applies", func(t *testing.T) {
		_, err := organizationInferences(org, nil).Execute(t.Context(), aihistory.OrganizationFilter{})
		require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(err))
		_, err = organizationInferences(org, aitest.Flags(false)).Execute(t.Context(), aihistory.OrganizationFilter{})
		require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(err))
	})
}

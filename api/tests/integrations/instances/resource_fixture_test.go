package instances_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// resourceEntitlementOptions shapes newResourceEntitlement.
type resourceEntitlementOptions struct {
	aggregation      entitlementschema.AggregationMethod
	resetPeriod      *period.ResetPeriod
	resetAnchor      *period.ResetAnchor
	warningThreshold int32
}

// newResourceEntitlement creates a NUMBER entitlement that counts per resource,
// SUM and a lifetime counter unless an option says otherwise.
func newResourceEntitlement(t *testing.T, options ...func(*resourceEntitlementOptions)) *entitlementschema.Entitlement {
	t.Helper()
	o := resourceEntitlementOptions{aggregation: entitlementschema.Sum}
	for _, option := range options {
		option(&o)
	}

	slug, err := slugutil.GenerateUnique("sources-per-competitor")
	require.NoError(t, err)
	description := "Sources per competitor"
	entitlement, err := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB)).CreateEntitlement(
		t.Context(),
		createentitlement.CreateEntitlementInput{
			Name:                    "Sources per competitor",
			Slug:                    slug,
			Description:             &description,
			Type:                    entitlementschema.Number,
			AggregationMethod:       ptr.To(o.aggregation),
			LimitScope:              entitlementschema.LimitScopeResource,
			ResetPeriod:             o.resetPeriod,
			ResetAnchor:             o.resetAnchor,
			WarningThresholdPercent: o.warningThreshold,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)
	require.NotNil(t, entitlement.LimitScope)
	require.Equal(t, entitlementschema.LimitScopeResource, *entitlement.LimitScope)
	return entitlement
}

func withAggregation(method entitlementschema.AggregationMethod) func(*resourceEntitlementOptions) {
	return func(o *resourceEntitlementOptions) { o.aggregation = method }
}

func withPeriod(resetPeriod period.ResetPeriod, resetAnchor period.ResetAnchor) func(*resourceEntitlementOptions) {
	return func(o *resourceEntitlementOptions) { o.resetPeriod, o.resetAnchor = &resetPeriod, &resetAnchor }
}

func withWarningThreshold(percent int32) func(*resourceEntitlementOptions) {
	return func(o *resourceEntitlementOptions) { o.warningThreshold = percent }
}

// resourcesPath is the address of an entitlement's resources, and of one when
// resourceKey is not empty. Path segments are escaped as a client would.
func resourcesPath(instanceSlug, entitlementSlug, resourceKey string) string {
	path := "/api/instances/" + instanceSlug + "/entitlements/" + entitlementSlug + "/resources"
	if resourceKey != "" {
		path += "/" + url.PathEscape(resourceKey)
	}
	return path
}

// resourceReport is one response to a request of a resource route.
type resourceReport struct {
	status   int
	replayed string
	body     []byte
}

func (r resourceReport) usage(t *testing.T) schema.EntitlementUsage {
	t.Helper()
	require.Equal(t, fiber.StatusOK, r.status, "body: %s", r.body)
	var usage schema.EntitlementUsage
	require.NoError(t, json.Unmarshal(r.body, &usage))
	return usage
}

func (r resourceReport) problem(t *testing.T, status int) kaitenerrors.Problem {
	t.Helper()
	require.Equal(t, status, r.status, "body: %s", r.body)
	var problem kaitenerrors.Problem
	require.NoError(t, json.Unmarshal(r.body, &problem))
	return problem
}

// requireProblem checks the status and the code of an error answer.
func (r resourceReport) requireProblem(t *testing.T, status int, code string) kaitenerrors.Problem {
	t.Helper()
	problem := r.problem(t, status)
	require.Equal(t, code, problem.Code, "body: %s", r.body)
	return problem
}

// sendResource sends a request to app (the suite's server when nil) and reads
// the whole response.
func sendResource(t *testing.T, app *fiber.App, method, path string, payload any, headers map[string]string) resourceReport {
	t.Helper()
	if app == nil {
		app = testServer.App
	}
	req := commonfixture.NewJSONRequest(t, method, path, payload, headers)
	resp, err := app.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	return resourceReport{status: resp.StatusCode, replayed: resp.Header.Get("Idempotent-Replayed"), body: body}
}

func numberReport(value float64, behavior string) map[string]any {
	return map[string]any{"value": map[string]any{"type": "number", "value": value}, "behavior": behavior}
}

// reportResource sends a numeric report for one resource.
func reportResource(t *testing.T, instanceSlug, entitlementSlug, resourceKey string, value float64, behavior string) resourceReport {
	t.Helper()
	return sendResource(t, nil, http.MethodPost, resourcesPath(instanceSlug, entitlementSlug, resourceKey)+"/usage", numberReport(value, behavior), nil)
}

// reportResourceWithKey is reportResource sent under an Idempotency-Key.
func reportResourceWithKey(t *testing.T, app *fiber.App, instanceSlug, entitlementSlug, resourceKey string, value float64, behavior, idempotencyKey string) resourceReport {
	t.Helper()
	return sendResource(t, app, http.MethodPost, resourcesPath(instanceSlug, entitlementSlug, resourceKey)+"/usage", numberReport(value, behavior),
		map[string]string{"Idempotency-Key": idempotencyKey})
}

// requireResourceReport sends a report and checks it answered want.
func requireResourceReport(t *testing.T, want int, instanceSlug, entitlementSlug, resourceKey string, value float64, behavior string) resourceReport {
	t.Helper()
	got := reportResource(t, instanceSlug, entitlementSlug, resourceKey, value, behavior)
	require.Equal(t, want, got.status, "report %s %v for %s: %s", behavior, value, resourceKey, got.body)
	return got
}

// getResourceUsage reads one resource's usage.
func getResourceUsage(t *testing.T, instanceSlug, entitlementSlug, resourceKey string) resourceReport {
	t.Helper()
	return sendResource(t, nil, http.MethodGet, resourcesPath(instanceSlug, entitlementSlug, resourceKey)+"/usage", nil, nil)
}

// deleteResource forgets one resource's counter.
func deleteResource(t *testing.T, instanceSlug, entitlementSlug, resourceKey string) resourceReport {
	t.Helper()
	return sendResource(t, nil, http.MethodDelete, resourcesPath(instanceSlug, entitlementSlug, resourceKey), nil, nil)
}

// getEntitlementUsage reads an entitlement's own usage: the one row every reader
// of the pair shows.
func getEntitlementUsage(t *testing.T, instanceSlug, entitlementSlug string) schema.EntitlementUsage {
	t.Helper()
	got := sendResource(t, nil, http.MethodGet, "/api/instances/"+instanceSlug+"/entitlements/"+entitlementSlug+"/usage", nil, nil)
	return got.usage(t)
}

// counterValue is the number a usage answers with.
func counterValue(t *testing.T, usage schema.EntitlementUsage) float64 {
	t.Helper()
	require.NotNil(t, usage.Value.Number, "usage value is not a number")
	return usage.Value.Number.Value
}

// resourceRow is an entitlement_resource_usage row as the tests read it.
type resourceRow struct {
	ResourceKey string
	Value       float64
	EventCount  int32
	PeriodStart *time.Time
}

func resourceRows(t *testing.T, instanceID, entitlementID uuid.UUID) []resourceRow {
	t.Helper()
	rows, err := testServer.Dependencies.DB.Query(t.Context(), `
		SELECT resource_key, (value->>'value')::float8, (value->>'event_count')::int, period_start
		FROM entitlement_resource_usage
		WHERE instance_id = $1 AND entitlement_id = $2
		ORDER BY resource_key`, instanceID, entitlementID)
	require.NoError(t, err)
	defer rows.Close()

	var out []resourceRow
	for rows.Next() {
		var r resourceRow
		require.NoError(t, rows.Scan(&r.ResourceKey, &r.Value, &r.EventCount, &r.PeriodStart))
		out = append(out, r)
	}
	require.NoError(t, rows.Err())
	return out
}

func resourceValues(t *testing.T, instanceID, entitlementID uuid.UUID) map[string]float64 {
	t.Helper()
	out := map[string]float64{}
	for _, r := range resourceRows(t, instanceID, entitlementID) {
		out[r.ResourceKey] = r.Value
	}
	return out
}

// ledgerResourceKeys is the resource of every journal row of the pair, in
// report_seq order; "" for a row that names none.
func ledgerResourceKeys(t *testing.T, instanceID, entitlementID uuid.UUID) []string {
	t.Helper()
	rows, err := testServer.Dependencies.DB.Query(t.Context(), `
		SELECT coalesce(resource_key, '') FROM usage_ledger
		WHERE instance_id = $1 AND entitlement_id = $2 ORDER BY report_seq`, instanceID, entitlementID)
	require.NoError(t, err)
	defer rows.Close()

	var out []string
	for rows.Next() {
		var key string
		require.NoError(t, rows.Scan(&key))
		out = append(out, key)
	}
	require.NoError(t, rows.Err())
	return out
}

// newServerWithConfig builds a second server on the suite's database, closed
// with the test.
func newServerWithConfig(t *testing.T, options tests.TestServerOptions) *tests.TestServer {
	t.Helper()
	server := tests.NewTestServer(testDb, options)
	t.Cleanup(func() { require.NoError(t, server.Close()) })
	return server
}

// assignPerResourceEntitlement grants a hard limit to a licence.
func assignHardLimit(t *testing.T, licenseSlug, entitlementSlug string, limit int32) {
	t.Helper()
	assignEntitlementToLicenseWithOverage(t, licenseSlug, entitlementSlug, limit, 0)
}

// eventPayloads decodes the outbox payloads of one event name that are about one
// of the entitlements, oldest first: the subtests of a test share one database, so
// an event is told by its entitlement, spelled entitlement_slug or entitlementSlug
// as the event's family spells it. ListOutboxEvents answers newest first; events
// a single report wrote share its instant, so their order among themselves is not
// meant to be read.
func eventPayloads(t *testing.T, eventName string, entitlementSlugs ...string) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if event.EventName != eventName {
			continue
		}
		var payload map[string]any
		require.NoError(t, json.Unmarshal(event.Data, &payload))
		slug, _ := payload["entitlement_slug"].(string)
		if slug == "" {
			slug, _ = payload["entitlementSlug"].(string)
		}
		if slices.Contains(entitlementSlugs, slug) {
			out = append(out, payload)
		}
	}
	slices.Reverse(out)
	return out
}

func repeat(s string, n int) string { return strings.Repeat(s, n) }

package dogfooding_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/open-feature/go-sdk/openfeature"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/config"
	dogfoodinginfra "github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/createcomponent"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/createcustomer"
	customerevents "github.com/kaitencloud/kaiten/api/internal/modules/customers/events"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeploymentzone"
	deploymentzonesdb "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/createinstance"
	instancesdb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	instancesschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	integrationschema "github.com/kaitencloud/kaiten/api/internal/modules/integrations/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/integrations/upsertintegration"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/associateentitlementwithlicense"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/createlicense"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/createrelease"
	"github.com/kaitencloud/kaiten/api/internal/seeder"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
	"github.com/kaitencloud/kaiten/api/pkg/dogfoodingctx"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

var kaitenOrganizationID = uuid.MustParse("11111111-1111-1111-1111-111111111111")

type dogfoodingSetup struct {
	KaitenOrgID uuid.UUID
	PlainToken  string
}

type synchronousUsageReporter struct {
	inner   *dogfoodinginfra.Reporter
	results chan error
}

func newSynchronousUsageReporter(t *testing.T, sinkBaseURL string, setup dogfoodingSetup) *synchronousUsageReporter {
	t.Helper()

	tokenFile := filepath.Join(t.TempDir(), "service-token")
	require.NoError(t, os.WriteFile(tokenFile, []byte(setup.PlainToken), 0o600))
	reporter, err := dogfoodinginfra.NewReporter(t.Context(), dogfoodinginfra.Config{
		APIURL: sinkBaseURL,
		OrgID:  setup.KaitenOrgID.String(),
	}, tokenFile)
	require.NoError(t, err)
	t.Cleanup(reporter.Close)

	return &synchronousUsageReporter{
		inner:   reporter,
		results: make(chan error, 4),
	}
}

func (r *synchronousUsageReporter) TrackAsync(orgID uuid.UUID, entitlementSlug string) {
	r.results <- r.inner.ReportAndEnforce(context.Background(), orgID, entitlementSlug)
}

func (r *synchronousUsageReporter) DecrementAsync(orgID uuid.UUID, entitlementSlug string) {
	r.results <- r.inner.Decrement(context.Background(), orgID, entitlementSlug)
}

func (r *synchronousUsageReporter) ReportAndEnforce(ctx context.Context, orgID uuid.UUID, entitlementSlug string) error {
	err := r.inner.ReportAndEnforce(ctx, orgID, entitlementSlug)
	r.results <- err
	return err
}

func (r *synchronousUsageReporter) Decrement(ctx context.Context, orgID uuid.UUID, entitlementSlug string) error {
	err := r.inner.Decrement(ctx, orgID, entitlementSlug)
	r.results <- err
	return err
}

func TestDogfooding(t *testing.T) {
	t.Run("WhenNonKaitenOrgCreatesCustomer_ReportsUsageToKaitenOrg", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		sinkServer, sinkHTTP := newSinkServer(t)
		_ = sinkServer

		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		payload := customerschema.Customer{Name: "Dogfooding Customer"}
		req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/customers", payload)
		resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		created := commonfixture.AssertJSONResponse[customerschema.Customer](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.NoError(t, waitForUsageReport(usageReporter))

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "customers", 1, 1)

		usage, status, err := getUsageMetric(sinkHTTP.URL, setup.PlainToken, testDb.DefaultData.OrganizationID, "customers")
		require.NoError(t, err)
		require.Equal(t, fiber.StatusOK, status)
		require.NotNil(t, usage.Value.Number)
		require.EqualValues(t, 1, usage.Value.Number.Value)
		require.EqualValues(t, 1, usage.Value.Number.EventCount)
	})

	t.Run("WhenKaitenOrgCreatesCustomer_DoesNotSelfReport", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		sinkServer, sinkHTTP := newSinkServer(t)
		_ = sinkServer

		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		seedTrackedInstance(t, kaitenOrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)

		sourceServer := newDogfoodingSourceServer(t, kaitenOrganizationID, sinkHTTP.URL, setup, usageReporter)

		payload := customerschema.Customer{Name: "Internal Kaiten Customer"}
		req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/customers", payload)
		resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[customerschema.Customer](t, resp, fiber.StatusCreated)
		require.NoError(t, waitForUsageReport(usageReporter))

		waitForReportedUsage(t, setup.KaitenOrgID, kaitenOrganizationID, "customers", 0, 0)

		deadline := time.Now().Add(1 * time.Second)
		for time.Now().Before(deadline) {
			usage, status, err := getUsageMetric(sinkHTTP.URL, setup.PlainToken, kaitenOrganizationID, "customers")
			require.NoError(t, err)
			require.Equal(t, fiber.StatusOK, status)
			require.NotNil(t, usage.Value.Number)
			require.EqualValues(t, 0, usage.Value.Number.Value)
			require.EqualValues(t, 0, usage.Value.Number.EventCount)
			time.Sleep(100 * time.Millisecond)
		}
	})

	t.Run("WhenNonKaitenOrgGetsCustomerViaREST_ReportsReadUsageToKaitenOrg", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		customer := createSourceCustomer(t, sourceServer, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID, "Dogfooding REST Read")
		req := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/customers/"+customer.Slug, nil)
		resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[customerschema.Customer](t, resp, fiber.StatusOK)
		require.NoError(t, waitForUsageReport(usageReporter))

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "customers-read", 1, 1)
	})

	t.Run("WhenNonKaitenOrgQueriesCustomersViaGraphQL_ReportsReadUsageToKaitenOrg", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		_ = createSourceCustomer(t, sourceServer, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID, "Dogfooding GraphQL Read")
		executeGraphQL(t, sourceServer, `{
			customers {
				items {
					id
					name
				}
			}
		}`)
		require.NoError(t, waitForUsageReport(usageReporter))

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "customers-read", 1, 1)
	})

	t.Run("WhenNonKaitenOrgUpdatesCustomer_ReportsUsageToKaitenOrg", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		customer := createSourceCustomer(t, sourceServer, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID, "Dogfooding Update")
		payload := customerschema.Customer{Name: "Dogfooding Update Renamed"}
		req := commonfixture.NewJSONRequest(t, http.MethodPut, "/api/customers/"+customer.Slug, payload)
		resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		require.NoError(t, waitForUsageReport(usageReporter))

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "customers-updated", 1, 1)
	})

	t.Run("WhenNonKaitenOrgDeletesCustomer_ReportsUsageToKaitenOrg", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		customer := createSourceCustomer(t, sourceServer, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID, "Dogfooding Delete")
		req := commonfixture.NewJSONRequest(t, http.MethodDelete, "/api/customers/"+customer.Slug, nil)
		resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		require.NoError(t, waitForUsageReport(usageReporter))

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "customers", -1, 1)
	})

	t.Run("WhenNonKaitenOrgCreatesComponent_ReportsUsageToKaitenOrg", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/components", componentschema.Component{
			Name:    "Dogfooding Component",
			Version: "v1.0.0",
		})
		resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[componentschema.Component](t, resp, fiber.StatusCreated)
		require.NoError(t, waitForUsageReport(usageReporter))

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "components", 1, 1)
	})

	t.Run("WhenNonKaitenOrgQueriesReleasesWithRelationsViaGraphQL_ReportsUsageToKaitenOrg", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		createSourceReleaseRelationsFixture(
			t,
			sourceServer,
			testDb.DefaultData.OrganizationID,
			testDb.DefaultData.UserID,
			"Dogfooding Release GraphQL",
		)

		executeGraphQL(t, sourceServer, `{
			releases {
				items {
					id
					components {
						id
					}
					deploymentZones {
						id
					}
					instances {
						id
					}
				}
			}
		}`)
		require.NoError(t, waitForUsageReports(usageReporter, 4))

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "releases-read", 1, 1)
		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "components-read", 1, 1)
		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "deployment-zones-read", 1, 1)
		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "instances-read", 1, 1)
	})

	t.Run("WhenNonKaitenOrgChecksEntitlementValue_ReportsUsageToKaitenOrg", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		instance, entitlement := createSourceUsageFixture(t, sourceServer, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID, "Dogfooding Check")
		req := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/instances/"+instance.Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[instancesschema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.NoError(t, waitForUsageReport(usageReporter))

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "entitlement-values-checked", 1, 1)
	})

	t.Run("WhenNonKaitenOrgReportsEntitlementValue_ReportsUsageToKaitenOrg", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		instance, entitlement := createSourceUsageFixture(t, sourceServer, testDb.DefaultData.OrganizationID, testDb.DefaultData.UserID, "Dogfooding Report")
		req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/instances/"+instance.Slug+"/entitlements/"+entitlement.Slug+"/usage", map[string]any{
			"behavior": reportentitlementusagemetric.BehaviorAppend,
			"value": map[string]any{
				"type":  "number",
				"value": 1,
			},
		})
		resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[instancesschema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.NoError(t, waitForUsageReport(usageReporter))

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "entitlement-values-reported", 1, 1)
	})

	t.Run("WhenNonKaitenOrgEvaluatesFeatureFlag_ReportsUsageToKaitenOrg", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		seedSourceFeatureFlag(t, sourceServer)
		req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/ofrep/v1/evaluate/flags/dogfooding-flag", map[string]any{
			"context": map[string]any{"targetingKey": "user-123"},
		})
		resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
		require.NoError(t, waitForUsageReport(usageReporter))

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "feature-flags-evaluated", 1, 1)
	})

	// Every legitimate emitter of a platform-internal evaluation authenticates
	// with a Dogfooding-scoped service token, so the caller's own organization
	// is what exempts them from metering and from the audit stream. The
	// evaluation context still carries the target org as data (BuildContext),
	// and is-kaiten is looked up under the caller's org, which
	// seedDogfoodingTarget already seeded.
	t.Run("WhenDogfoodingEvaluatesIsKaiten_DoesNotReenterDogfoodingReporting", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		platformServer := newDogfoodingSourceServer(t, setup.KaitenOrgID, sinkHTTP.URL, setup, usageReporter)

		req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/ofrep/v1/evaluate/flags/is-kaiten", map[string]any{
			"context": dogfoodingctx.BuildContext(testDb.DefaultData.OrganizationID),
		})
		resp, err := platformServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		require.NoError(t, ensureNoUsageReport(usageReporter, 1*time.Second))
		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "feature-flags-evaluated", 0, 0)
	})

	// The same exemption used to be claimable from the request body: any caller
	// holding read:feature_flags could send the internal marker and keep its own
	// evaluations out of both billing and the evaluation-event stream. The
	// marker is now ignored — and dropped before evaluation, so it cannot reach
	// a targeting rule either (ofrep.ResetKaitenFacts).
	t.Run("WhenNonKaitenOrgForgesTheInternalMarker_StillReportsUsageToKaitenOrg", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		seedSourceFeatureFlag(t, sourceServer)
		req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/ofrep/v1/evaluate/flags/dogfooding-flag", map[string]any{
			"context": map[string]any{
				"targetingKey": "user-123",
				dogfoodingctx.InternalEvaluationContextKey: true,
			},
		})
		resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "feature-flags-evaluated", 1, 1)
	})

	t.Run("WhenCustomerCreationLimitReached_BlocksCreationAndReturnsConflict", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTargetWithThresholds(t, testDb.DefaultData.OrganizationID, map[string]float64{
			"customers": 2,
		})
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		// First two customers should succeed.
		for i := range 2 {
			req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/customers", customerschema.Customer{
				Name: fmt.Sprintf("Customer %d", i+1),
			})
			resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, resp.Body)
			commonfixture.AssertJSONResponse[customerschema.Customer](t, resp, fiber.StatusCreated)
			require.NoError(t, waitForUsageReport(usageReporter))
		}

		// Third customer must be blocked.
		req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/customers", customerschema.Customer{
			Name: "Customer 3",
		})
		resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusConflict, resp.StatusCode)

		reportErr := waitForUsageReport(usageReporter)
		require.True(t, errors.Is(reportErr, dogfoodinginfra.ErrThresholdExceeded))

		// Usage must still reflect exactly 2 successful creations.
		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "customers", 2, 2)
	})

	// Regression test: a customer creation rejected through the
	// integration-upsert endpoint (used by external connectors) used to be
	// invisible to anything subscribing to CustomerCreationRejected,
	// because upsertintegration carried its own copy of the entitlement check
	// that never recorded the event createcustomer's direct-create path does.
	// Composing upsertintegration's create branch through
	// createcustomer.UseCase.EnforceCreationLimit (the same method, not a
	// second copy) means both paths now record the identical event.
	t.Run("WhenCustomerCreationLimitReachedViaIntegrationUpsert_RecordsRejectionEvent", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTargetWithThresholds(t, testDb.DefaultData.OrganizationID, map[string]float64{
			"customers": 1,
		})
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		upsertCustomerViaIntegration := func(externalID, name string) *http.Response {
			req := commonfixture.NewJSONRequest(t, http.MethodPatch, "/api/integration/crm.attio/customer/"+externalID, upsertintegration.CustomerBody{
				Name: ptr.To(name),
			})
			resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			return resp
		}

		// First customer, created through the integration-upsert path, succeeds.
		firstResp := upsertCustomerViaIntegration("rec_customer_1", "Customer 1")
		defer commonfixture.MustCloseBody(t, firstResp.Body)
		commonfixture.AssertJSONResponse[integrationschema.CustomerIntegrationResource](t, firstResp, fiber.StatusOK)
		require.NoError(t, waitForUsageReport(usageReporter))

		// Second, over the threshold, must be blocked exactly like the direct
		// /api/customers path is.
		secondResp := upsertCustomerViaIntegration("rec_customer_2", "Customer 2")
		defer commonfixture.MustCloseBody(t, secondResp.Body)
		require.Equal(t, fiber.StatusConflict, secondResp.StatusCode)

		reportErr := waitForUsageReport(usageReporter)
		require.True(t, errors.Is(reportErr, dogfoodinginfra.ErrThresholdExceeded))

		// The actual bug fix: the rejection must be visible in the outbox,
		// not just returned as an HTTP error.
		events := commonfixture.ListOutboxEvents(t, testDb.DbPool, testDb.DefaultData.OrganizationID)
		var found bool
		for _, e := range events {
			if e.EventType == customerevents.CustomerCreationRejected.Type {
				found = true
				break
			}
		}
		require.True(t, found, "expected a %s outbox event after the integration-upsert path rejected a creation over the entitlement limit", customerevents.CustomerCreationRejected.Type)
	})

	t.Run("WhenComponentCreationLimitReached_BlocksCreationAndReturnsConflict", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTargetWithThresholds(t, testDb.DefaultData.OrganizationID, map[string]float64{
			"components": 1,
		})
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		// First component should succeed.
		req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/components", componentschema.Component{
			Name:    "Component 1",
			Version: "v1.0.0",
		})
		resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[componentschema.Component](t, resp, fiber.StatusCreated)
		require.NoError(t, waitForUsageReport(usageReporter))

		// Second component must be blocked.
		req = commonfixture.NewJSONRequest(t, http.MethodPost, "/api/components", componentschema.Component{
			Name:    "Component 2",
			Version: "v1.0.0",
		})
		resp, err = sourceServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusConflict, resp.StatusCode)

		reportErr := waitForUsageReport(usageReporter)
		require.True(t, errors.Is(reportErr, dogfoodinginfra.ErrThresholdExceeded))

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "components", 1, 1)
	})

	// The licenses quota counts products, not their versions: a
	// revision joins a family the organization already has. Only the create
	// that opens the family reports, and only the delete that takes the family
	// with it gives the license back.
	t.Run("WhenNonKaitenOrgRevisesALicense_OnlyItsFamilyIsCounted", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		first := postSourceLicense(t, sourceServer, "Dogfooding Product", nil)
		require.NoError(t, waitForUsageReport(usageReporter))

		second := postSourceLicense(t, sourceServer, "Dogfooding Product", map[string]any{"familyId": first.FamilyID})
		require.Equal(t, first.FamilyID, second.FamilyID)
		require.NoError(t, ensureNoUsageReport(usageReporter, 200*time.Millisecond), "a new version is not metered")

		deleteSourceLicense(t, sourceServer, second.Slug)
		require.NoError(t, ensureNoUsageReport(usageReporter, 200*time.Millisecond), "the family is still there")
		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "licenses", 1, 1)

		deleteSourceLicense(t, sourceServer, first.Slug)
		require.NoError(t, waitForUsageReport(usageReporter))
		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "licenses", 0, 2)
	})

	// At the limit, a new product is refused, and a new version of an existing
	// one still goes through: the version is not metered at all.
	t.Run("WhenLicenseCreationLimitReached_NewVersionsAreStillCreated", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTargetWithThresholds(t, testDb.DefaultData.OrganizationID, map[string]float64{
			"licenses": 1,
		})
		usageReporter := newSynchronousUsageReporter(t, sinkHTTP.URL, setup)
		sourceServer := newDogfoodingSourceServer(t, testDb.DefaultData.OrganizationID, sinkHTTP.URL, setup, usageReporter)

		product := postSourceLicense(t, sourceServer, "Limited Product", nil)
		require.NoError(t, waitForUsageReport(usageReporter))

		problem := postSourceLicenseRefused(t, sourceServer, "Second Product", fiber.StatusConflict)
		require.Equal(t, "CreateLicense.EntitlementLimitReached", problem.Code)
		reportErr := waitForUsageReport(usageReporter)
		require.True(t, errors.Is(reportErr, dogfoodinginfra.ErrThresholdExceeded))

		revision := postSourceLicense(t, sourceServer, "Limited Product", map[string]any{"familySlug": product.Slug})
		require.Equal(t, product.FamilyID, revision.FamilyID)
		require.NoError(t, ensureNoUsageReport(usageReporter, 200*time.Millisecond), "a new version is not metered")

		waitForReportedUsage(t, setup.KaitenOrgID, testDb.DefaultData.OrganizationID, "licenses", 1, 1)
	})

	// The dogfooding-off path. Every metered handler used to ask
	// "if h.deps.UsageReporter != nil" before reporting; wiring now installs a
	// services.NoopUsageReporter instead, so those questions are gone and a
	// missed construction path would be a nil dereference rather than a silent
	// skip. Both halves matter: the handlers must still answer, and the sink
	// the enabled subtests above observe reports on must stay empty.
	t.Run("WhenDogfoodingIsDisabled_MeteredHandlersSucceedAndReportNothing", func(t *testing.T) {
		t.Cleanup(func() {
			openfeature.Shutdown()
			require.NoError(t, testDb.Reset())
		})

		_, sinkHTTP := newSinkServer(t)
		setup := seedDogfoodingTarget(t, testDb.DefaultData.OrganizationID)

		// No UsageReporter, DogfoodingEnabled left false: the wiring every
		// deployment with dogfooding off runs.
		organizationID := testDb.DefaultData.OrganizationID
		sourceServer := tests.NewTestServer(testDb, tests.TestServerOptions{
			OrganizationID: &organizationID,
		})
		t.Cleanup(func() { require.NoError(t, sourceServer.Close()) })

		// One handler of each metered shape: EnforceAndPersist on create,
		// TrackAsync on read, list and update, DecrementAsync on delete, and a
		// GraphQL traversal for the dataloaders' own metering.
		created := postSourceCustomer(t, sourceServer, "Dogfooding Disabled Customer")
		getSourceOK(t, sourceServer, "/api/customers")
		getSourceOK(t, sourceServer, "/api/customers/"+created.Slug)
		executeGraphQL(t, sourceServer, `{
			customers {
				items {
					id
					instances { id }
				}
			}
		}`)
		updateSourceCustomer(t, sourceServer, created.Slug, "Dogfooding Disabled Renamed")
		deleteSourceCustomer(t, sourceServer, created.Slug)

		// Nothing was reported: the counters the enabled subtests assert on
		// stay at zero for a full settle window rather than merely starting there.
		deadline := time.Now().Add(1 * time.Second)
		for time.Now().Before(deadline) {
			for _, entitlementSlug := range []string{"customers", "customers-read", "customers-updated"} {
				usage, status, err := getUsageMetric(sinkHTTP.URL, setup.PlainToken, organizationID, entitlementSlug)
				require.NoError(t, err)
				require.Equal(t, fiber.StatusOK, status)
				require.NotNil(t, usage.Value.Number)
				require.Zero(t, usage.Value.Number.Value, "entitlement %q", entitlementSlug)
				require.Zero(t, usage.Value.Number.EventCount, "entitlement %q", entitlementSlug)
			}
			time.Sleep(100 * time.Millisecond)
		}
	})
}

type sinkHTTPServer struct {
	URL string
}

func newSinkServer(t *testing.T) (*tests.TestServer, *sinkHTTPServer) {
	t.Helper()

	sinkServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		OrganizationID: ptr.To(kaitenOrganizationID),
	})

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	go func() {
		_ = sinkServer.App.Listener(listener)
	}()

	t.Cleanup(func() {
		// Close, not just App.Shutdown: every subtest builds its own sink and
		// source servers, and their pgnotify listeners must let go of their
		// connections before the next subtest restores the database.
		require.NoError(t, sinkServer.Close())
		_ = listener.Close()
	})

	return sinkServer, &sinkHTTPServer{
		URL: "http://" + listener.Addr().String(),
	}
}

func newDogfoodingSourceServer(t *testing.T, organizationID uuid.UUID, sinkBaseURL string, setup dogfoodingSetup, usageReporter *synchronousUsageReporter) *tests.TestServer {
	t.Helper()

	sourceServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		OrganizationID: &organizationID,
		UsageReporter:  usageReporter,
		ConfigOverride: func(cfg *config.Config) {
			cfg.Metered.Enabled = true
			cfg.Metered.OrganizationID = setup.KaitenOrgID.String()
			cfg.Metered.APIURL = sinkBaseURL
		},
	})
	t.Cleanup(func() { require.NoError(t, sourceServer.Close()) })

	return sourceServer
}

func seedDogfoodingTarget(t *testing.T, trackedOrgID uuid.UUID) dogfoodingSetup {
	t.Helper()
	return seedDogfoodingTargetWithThresholds(t, trackedOrgID, nil)
}

// seedDogfoodingTargetWithThresholds seeds the dogfooding target with optional threshold overrides.
// thresholds maps entitlement slug → threshold value; unspecified slugs default to -1 (unlimited).
func seedDogfoodingTargetWithThresholds(t *testing.T, trackedOrgID uuid.UUID, thresholds map[string]float64) dogfoodingSetup {
	t.Helper()

	ctx := context.Background()
	sc := seeder.NewSeederContext(testDb.DbPool, nil)

	actualKaitenOrgID, err := sc.EnsureOrganization(ctx, organizationdb.CreateOrganizationParams{
		ID:         kaitenOrganizationID,
		Name:       "Kaiten",
		ExternalID: "dogfooding-kaiten-org",
	})
	require.NoError(t, err)
	require.NoError(t, sc.EnsureUserOnOrganization(ctx, organizationdb.CreateUserOnOrganizationParams{
		OrganizationID: actualKaitenOrgID,
		UserID:         testDb.DefaultData.UserID,
	}))

	orgCtx := sc.WithOrganization(actualKaitenOrgID, testDb.DefaultData.UserID)

	serviceAccount, err := orgCtx.Identity.CreateServiceAccount.Execute(ctx, "Dogfooding SDK", ptr.To("dogfooding-sdk"))
	require.NoError(t, err)

	token, err := orgCtx.Identity.CreateTokenOnServiceAccount.Execute(
		ctx,
		serviceAccount.Slug,
		"Dogfooding Token",
		ptr.To("dogfooding-token"),
		[]string{"write:instances", "read:feature_flags"},
		nil,
	)
	require.NoError(t, err)

	aggregationMethod := entitlementschema.Sum

	license, err := orgCtx.Licenses.CreateLicense.Execute(ctx, &createlicense.Command{
		Name:        "Beta Tester",
		Description: "Dogfooding license for integration tests",
		Type:        licenseschema.Community,
		VersionName: ptr.To("v1"),
		IsDefault:   true,
	})
	require.NoError(t, err)

	// Every slug, not just the metered ones: any of them can be named by a use
	// case this test drives, and one the reporter names but nobody created
	// fails that call rather than skipping it. Names are the slugs -- the
	// catalogue's presentation data lives with the bootstrap that creates it,
	// and nothing here reads it.
	for _, slug := range dogfooding.EntitlementSlugs {
		entitlement, err := orgCtx.Entitlements.CreateEntitlement.Execute(ctx, &createentitlement.Command{
			Name:              slug,
			Slug:              ptr.To(slug),
			Type:              entitlementschema.Number,
			AggregationMethod: &aggregationMethod,
		})
		require.NoError(t, err)

		threshold := entitlementvalue.UnlimitedThreshold
		if thresholds != nil {
			if v, ok := thresholds[slug]; ok {
				threshold = v
			}
		}

		err = orgCtx.Licenses.AssociateEntitlementWithLicense.Execute(ctx, license.Slug, &associateentitlementwithlicense.Command{
			EntitlementSlug: entitlement.Slug,
			Value:           map[string]any{"type": "number", "value": threshold},
		})
		require.NoError(t, err)
	}

	createIsKaitenFlag(t, orgCtx, actualKaitenOrgID)
	seedTrackedInstanceWithThresholds(t, trackedOrgID, thresholds)

	return dogfoodingSetup{
		KaitenOrgID: actualKaitenOrgID,
		PlainToken:  token.Value,
	}
}

func seedTrackedInstance(t *testing.T, trackedOrgID uuid.UUID) {
	t.Helper()
	seedTrackedInstanceWithThresholds(t, trackedOrgID, nil)
}

// seedTrackedInstanceWithThresholds creates the tracked instance used by the dogfooding reporter.
// thresholds maps entitlement slug → threshold value; unspecified slugs default to -1 (unlimited).
func seedTrackedInstanceWithThresholds(t *testing.T, trackedOrgID uuid.UUID, thresholds map[string]float64) {
	t.Helper()

	ctx := context.Background()
	orgCtx := seeder.NewSeederContext(testDb.DbPool, nil).WithOrganization(kaitenOrganizationID, testDb.DefaultData.UserID)

	customer, err := orgCtx.Customers.CreateCustomer.Execute(ctx, &createcustomer.Command{
		Name:               "Tracked " + trackedOrgID.String(),
		Slug:               ptr.To("tracked-" + trackedOrgID.String()),
		ExternalCustomerID: ptr.To(trackedOrgID.String()),
	})
	require.NoError(t, err)

	license, err := orgCtx.Licenses.CreateLicense.Execute(ctx, &createlicense.Command{
		Name:        "Tracked License " + trackedOrgID.String(),
		Description: "Dogfooding tracked license",
		Type:        licenseschema.Community,
		VersionName: ptr.To("v1"),
		IsDefault:   false,
	})
	require.NoError(t, err)

	for _, slug := range dogfooding.EntitlementSlugs {
		threshold := entitlementvalue.UnlimitedThreshold
		if thresholds != nil {
			if v, ok := thresholds[slug]; ok {
				threshold = v
			}
		}
		err = orgCtx.Licenses.AssociateEntitlementWithLicense.Execute(ctx, license.Slug, &associateentitlementwithlicense.Command{
			EntitlementSlug: slug,
			Value:           map[string]any{"type": "number", "value": threshold},
		})
		require.NoError(t, err)
	}

	_, err = orgCtx.Instances.CreateInstance.Execute(ctx, &createinstance.Command{
		Name:             "Tracked Instance " + trackedOrgID.String(),
		Description:      "Dogfooding tracked instance",
		CustomerID:       customer.ID,
		LicenseID:        license.ID,
		StartLicenseDate: time.Now().UTC(),
		EndLicenseDate:   time.Now().UTC().AddDate(1, 0, 0),
		Slug:             ptr.To(trackedOrgID.String()),
	})
	require.NoError(t, err)
}

func createIsKaitenFlag(t *testing.T, sc *seeder.SeederContext, kaitenOrgID uuid.UUID) {
	t.Helper()

	offVariant := schema.BasicVariant("off")
	flag := schema.FeatureFlag{
		Name:      "IsKaiten",
		Slug:      "is-kaiten",
		Type:      "boolean",
		Enabled:   true,
		EventName: "feature_flag.is_kaiten.integration",
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: &offVariant,
		},
		Variants: []schema.Variant{
			{Name: "on", Value: true},
			{Name: "off", Value: false},
		},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Kaiten org", fmt.Sprintf(`targetingKey == "%s"`, kaitenOrgID), "on"),
		},
		Metadata: map[string]any{"fallback_value": false},
	}

	_, err := sc.FeatureFlags.CreateFeatureFlag.Execute(context.Background(), &flag)
	require.NoError(t, err)
}

func getUsageMetric(sinkBaseURL, serviceToken string, orgID uuid.UUID, entitlementSlug string) (instancesschema.EntitlementUsage, int, error) {
	req, err := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/api/instances/%s/entitlements/%s/usage", sinkBaseURL, orgID.String(), entitlementSlug), nil)
	if err != nil {
		return instancesschema.EntitlementUsage{}, 0, err
	}
	if strings.TrimSpace(serviceToken) != "" {
		req.Header.Set("Authorization", "Bearer "+serviceToken)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return instancesschema.EntitlementUsage{}, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return instancesschema.EntitlementUsage{}, resp.StatusCode, err
	}

	var usage instancesschema.EntitlementUsage
	if strings.Contains(resp.Header.Get("Content-Type"), "json") && len(body) > 0 {
		err = json.Unmarshal(body, &usage)
		if err != nil {
			return instancesschema.EntitlementUsage{}, resp.StatusCode, err
		}
	}

	return usage, resp.StatusCode, nil
}

func waitForReportedUsage(t *testing.T, organizationID, trackedOrgID uuid.UUID, entitlementSlug string, expectedValue float64, expectedEventCount int32) {
	t.Helper()

	queries := instancesdb.New(testDb.DbPool)

	require.Eventually(t, func() bool {
		result, err := queries.GetEntitlementUsageForInstanceOrDefault(context.Background(), instancesdb.GetEntitlementUsageForInstanceOrDefaultParams{
			OrganizationID:  organizationID,
			InstanceSlug:    trackedOrgID.String(),
			EntitlementSlug: entitlementSlug,
		})
		if err != nil || result.EntitlementID == nil {
			return false
		}

		if expectedValue == 0 && len(result.UsageValue) == 0 {
			return true
		}

		if len(result.UsageValue) == 0 {
			return false
		}

		usage, err := entitlementvalue.ParseNumberUsageValue(result.UsageValue)
		if err != nil {
			return false
		}

		return usage.Value == expectedValue && usage.EventCount == expectedEventCount
	}, 5*time.Second, 100*time.Millisecond)
}

func waitForUsageReport(reporter *synchronousUsageReporter) error {
	select {
	case err := <-reporter.results:
		return err
	case <-time.After(5 * time.Second):
		return fmt.Errorf("timed out waiting for dogfooding report attempt")
	}
}

func waitForUsageReports(reporter *synchronousUsageReporter, count int) error {
	for range count {
		if err := waitForUsageReport(reporter); err != nil {
			return err
		}
	}
	return nil
}

func ensureNoUsageReport(reporter *synchronousUsageReporter, duration time.Duration) error {
	select {
	case err := <-reporter.results:
		return fmt.Errorf("unexpected dogfooding report attempt: %w", err)
	case <-time.After(duration):
		return nil
	}
}

func createSourceCustomer(t *testing.T, sourceServer *tests.TestServer, organizationID, userID uuid.UUID, name string) *customerschema.Customer {
	t.Helper()

	repo := createcustomer.NewCommandRepository(uow.NewUnitOfWork(sourceServer.Dependencies.DB))
	customer, err := repo.CreateCustomer(
		t.Context(),
		name,
		slugutil.Generate(name),
		nil,
		nil,
		organizationID,
		userID,
	)
	require.NoError(t, err)

	return customer
}

func createSourceComponent(t *testing.T, sourceServer *tests.TestServer, organizationID, userID uuid.UUID, name string) *componentschema.Component {
	t.Helper()

	repo := createcomponent.NewCommandRepository(uow.NewUnitOfWork(sourceServer.Dependencies.DB))
	componentSlug := slugutil.Generate(name)
	description := "Dogfooding component fixture"
	component, err := repo.CreateComponent(
		t.Context(),
		name,
		"v1.0.0",
		componentSlug,
		&description,
		nil,
		organizationID,
		userID,
	)
	require.NoError(t, err)

	return component
}

// postSourceCustomer, getSourceOK, updateSourceCustomer and
// deleteSourceCustomer drive the metered customer endpoints over HTTP --
// unlike createSourceCustomer, which writes through the repository and so
// reports nothing.
func postSourceCustomer(t *testing.T, sourceServer *tests.TestServer, name string) customerschema.Customer {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/customers", customerschema.Customer{Name: name})
	resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	return commonfixture.AssertJSONResponse[customerschema.Customer](t, resp, fiber.StatusCreated)
}

func getSourceOK(t *testing.T, sourceServer *tests.TestServer, path string) {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, http.MethodGet, path, nil)
	resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusOK, resp.StatusCode, "GET %s", path)
}

func updateSourceCustomer(t *testing.T, sourceServer *tests.TestServer, slug, name string) {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, http.MethodPut, "/api/customers/"+slug, customerschema.Customer{Name: name})
	resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
}

func deleteSourceCustomer(t *testing.T, sourceServer *tests.TestServer, slug string) {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, http.MethodDelete, "/api/customers/"+slug, nil)
	resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
}

// licenseBody is a create-license body for name; extra names the family a new
// version joins, when there is one.
func licenseBody(name string, extra map[string]any) map[string]any {
	body := map[string]any{
		"name":        name,
		"description": "Dogfooding license",
		"type":        "PAID",
		"isDefault":   false,
	}
	for key, value := range extra {
		body[key] = value
	}
	return body
}

func postSourceLicense(t *testing.T, sourceServer *tests.TestServer, name string, extra map[string]any) licenseschema.License {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/licenses", licenseBody(name, extra))
	resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	return commonfixture.AssertJSONResponse[licenseschema.License](t, resp, fiber.StatusCreated)
}

func postSourceLicenseRefused(t *testing.T, sourceServer *tests.TestServer, name string, wantStatus int) kaitenerrors.Problem {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/licenses", licenseBody(name, nil))
	resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	return commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, resp, wantStatus)
}

func deleteSourceLicense(t *testing.T, sourceServer *tests.TestServer, slug string) {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, http.MethodDelete, "/api/licenses/"+slug, nil)
	resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
}

func executeGraphQL(t *testing.T, sourceServer *tests.TestServer, query string) {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/graphql", map[string]any{
		"query": query,
	})
	resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload struct {
		Errors []map[string]any `json:"errors"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	require.Empty(t, payload.Errors)
}

func createSourceUsageFixture(t *testing.T, sourceServer *tests.TestServer, organizationID, userID uuid.UUID, name string) (*instancesschema.Instance, *entitlementschema.Entitlement) {
	t.Helper()

	customer := createSourceCustomer(t, sourceServer, organizationID, userID, name+" Customer")

	licenseRepo := createlicense.NewCommandRepository(uow.NewUnitOfWork(sourceServer.Dependencies.DB))
	licenseSlug := slugutil.Generate(name + " License")
	versionName := "v1"
	license, err := licenseRepo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        name + " License",
		Slug:        &licenseSlug,
		Description: "Dogfooding usage fixture",
		Type:        licenseschema.Development,
		VersionName: &versionName,
	}, organizationID)
	require.NoError(t, err)

	entitlementRepo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(sourceServer.Dependencies.DB))
	description := "Dogfooding usage entitlement"
	aggregationMethod := entitlementschema.Sum
	entitlementSlug := slugutil.Generate(name + " Entitlement")
	entitlement, err := entitlementRepo.CreateEntitlement(t.Context(), createentitlement.CreateEntitlementInput{
		Name:              name + " Entitlement",
		Slug:              entitlementSlug,
		Description:       &description,
		Type:              entitlementschema.Number,
		AggregationMethod: &aggregationMethod,
	}, organizationID)
	require.NoError(t, err)

	unlimitedOveragePercent := int16(entitlementvalue.UnlimitedOveragePercent)
	_, err = licensesdb.New(sourceServer.Dependencies.DB).AssociateEntitlementToLicense(t.Context(), licensesdb.AssociateEntitlementToLicenseParams{
		EntitlementSlug:                entitlement.Slug,
		LicenseSlug:                    license.Slug,
		Value:                          []byte(`{"type":"number","value":-1}`), // -1 = entitlementvalue.UnlimitedThreshold (unlimited)
		LimitCapExceededOveragePercent: &unlimitedOveragePercent,
		OrganizationID:                 organizationID,
		UserID:                         userID,
	})
	require.NoError(t, err)

	instanceRepo := createinstance.NewCommandRepository(uow.NewUnitOfWork(sourceServer.Dependencies.DB))
	instanceSlug := slugutil.Generate(name + " Instance")
	instance, err := instanceRepo.CreateInstance(t.Context(), &createinstance.Command{
		Name:             name + " Instance",
		Slug:             &instanceSlug,
		Description:      "Dogfooding usage instance",
		StartLicenseDate: time.Now().UTC(),
		EndLicenseDate:   time.Now().UTC().AddDate(1, 0, 0),
		LicenseID:        license.ID,
		CustomerID:       customer.ID,
	}, userID, organizationID)
	require.NoError(t, err)

	return instance, entitlement
}

func createSourceReleaseRelationsFixture(t *testing.T, sourceServer *tests.TestServer, organizationID, userID uuid.UUID, name string) {
	t.Helper()

	component := createSourceComponent(t, sourceServer, organizationID, userID, name+" Component")

	releaseRepo := createrelease.NewCommandRepository(uow.NewUnitOfWork(sourceServer.Dependencies.DB))
	releaseSlug := slugutil.Generate(name + " Release")
	release, err := releaseRepo.CreateRelease(
		t.Context(),
		"v1.0.0",
		releaseSlug,
		ptr.To("Dogfooding release fixture"),
		organizationID,
		userID,
	)
	require.NoError(t, err)
	require.NoError(t, releaseRepo.AddComponentToRelease(t.Context(), component.ID, release.ID, organizationID))

	deploymentZoneRepo := createdeploymentzone.NewCommandRepository(uow.NewUnitOfWork(sourceServer.Dependencies.DB))
	deploymentZoneSlug := slugutil.Generate(name + " Zone")
	deploymentZone, err := deploymentZoneRepo.CreateDeploymentZone(
		t.Context(),
		name+" Zone",
		deploymentZoneSlug,
		"production",
		map[string]any{"provider": "dogfooding"},
		"Dogfooding deployment zone fixture",
		nil,
		organizationID,
		userID,
	)
	require.NoError(t, err)

	_, err = deploymentzonesdb.New(sourceServer.Dependencies.DB).CreateDeployment(t.Context(), deploymentzonesdb.CreateDeploymentParams{
		DeploymentZoneID: deploymentZone.ID,
		ReleaseID:        release.ID,
		OrganizationID:   organizationID,
		UserID:           userID,
	})
	require.NoError(t, err)

	customer := createSourceCustomer(t, sourceServer, organizationID, userID, name+" Customer")

	licenseRepo := createlicense.NewCommandRepository(uow.NewUnitOfWork(sourceServer.Dependencies.DB))
	licenseSlug := slugutil.Generate(name + " License")
	versionName := "v1"
	license, err := licenseRepo.CreateLicense(t.Context(), &createlicense.Command{
		Name:        name + " License",
		Slug:        &licenseSlug,
		Description: "Dogfooding release relations fixture",
		Type:        licenseschema.Development,
		VersionName: &versionName,
	}, organizationID)
	require.NoError(t, err)

	instanceRepo := createinstance.NewCommandRepository(uow.NewUnitOfWork(sourceServer.Dependencies.DB))
	instanceSlug := slugutil.Generate(name + " Instance")
	_, err = instanceRepo.CreateInstance(t.Context(), &createinstance.Command{
		Name:             name + " Instance",
		Slug:             &instanceSlug,
		Description:      "Dogfooding release relations instance",
		StartLicenseDate: time.Now().UTC(),
		EndLicenseDate:   time.Now().UTC().AddDate(1, 0, 0),
		LicenseID:        license.ID,
		CustomerID:       customer.ID,
		DeploymentZoneID: &deploymentZone.ID,
	}, userID, organizationID)
	require.NoError(t, err)
}

func seedSourceFeatureFlag(t *testing.T, sourceServer *tests.TestServer) {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/feature-flags", schema.FeatureFlag{
		Name: "Dogfooding Flag",
		Slug: "dogfooding-flag",
		Type: "boolean",
		Variants: []schema.Variant{
			{Name: "enabled", Value: true},
			{Name: "disabled", Value: false},
		},
		Targetings: schema.Targetings{},
		Metadata:   map[string]any{},
		Enabled:    true,
		EventName:  "schema.dogfooding",
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("enabled"),
		},
	})
	resp, err := sourceServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusCreated, resp.StatusCode)
}

package graphql_test

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// recordingUsageReporter records every entitlement slug reported, in place of
// firing an HTTP report. TrackAsync is synchronous here so a slug is recorded
// before the read that produced it returns -- by the time a request's response
// is written, every report it caused is already in the slice.
type recordingUsageReporter struct {
	mu    sync.Mutex
	slugs []string
}

var _ services.UsageReporter = (*recordingUsageReporter)(nil)

func (r *recordingUsageReporter) TrackAsync(_ uuid.UUID, entitlementSlug string) {
	r.record(entitlementSlug)
}

func (r *recordingUsageReporter) DecrementAsync(_ uuid.UUID, entitlementSlug string) {
	r.record("-" + entitlementSlug)
}

func (r *recordingUsageReporter) ReportAndEnforce(_ context.Context, _ uuid.UUID, entitlementSlug string) error {
	r.record(entitlementSlug)
	return nil
}

func (r *recordingUsageReporter) Decrement(_ context.Context, _ uuid.UUID, entitlementSlug string) error {
	r.record("-" + entitlementSlug)
	return nil
}

func (r *recordingUsageReporter) record(entitlementSlug string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.slugs = append(r.slugs, entitlementSlug)
}

// drain returns everything recorded so far, sorted, and resets the recorder so
// the next leg of a comparison starts from zero.
func (r *recordingUsageReporter) drain() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	drained := append([]string(nil), r.slugs...)
	r.slugs = nil
	sort.Strings(drained)
	return drained
}

// meteredServer is a second test server wired with a recording reporter --
// the package-level testServer deliberately has none.
func meteredServer(t *testing.T) (*tests.TestServer, *recordingUsageReporter) {
	t.Helper()

	reporter := &recordingUsageReporter{}
	return tests.NewTestServer(testDb, tests.TestServerOptions{
		UsageReporter: reporter,
	}), reporter
}

func getREST(t *testing.T, server *tests.TestServer, path string) {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, http.MethodGet, path, nil)
	resp, err := server.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, http.StatusOK, resp.StatusCode, "GET %s", path)
}

func postGraphQL(t *testing.T, server *tests.TestServer, query string) {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, http.MethodPost, "/api/graphql", map[string]any{"query": query})
	resp, err := server.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var payload struct {
		Errors []map[string]any `json:"errors"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	require.Empty(t, payload.Errors)
}

// TestUsageMetering_GraphQLTraversalMatchesREST is the regression test for
// nested GraphQL resolvers used to meter nothing, so the same data
// cost less through GraphQL than through REST. It pins the fix in both
// directions -- an under-billing traversal and a double-billed one both fail
// the multiset comparison, not just a count.
func TestUsageMetering_GraphQLTraversalMatchesREST(t *testing.T) {
	t.Run("WhenTraversingCustomerInstancesLicense_ReportsSameUsageAsRESTEquivalent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		server, reporter := meteredServer(t)

		license := newLicense(t, "Metering License")
		firstCustomer := newCustomer(t, "Metering Customer A")
		secondCustomer := newCustomer(t, "Metering Customer B")
		newInstance(t, "Metering Instance A", firstCustomer, license)
		newInstance(t, "Metering Instance B", secondCustomer, license)

		// The REST way to read the same three things.
		getREST(t, server, "/api/customers")
		getREST(t, server, "/api/instances")
		getREST(t, server, "/api/licenses/"+license.Slug)
		restUsage := reporter.drain()

		// The GraphQL way: one operation, the same three reads.
		postGraphQL(t, server, `{
			customers {
				items {
					id
					instances {
						id
						license { id }
					}
				}
			}
		}`)
		graphqlUsage := reporter.drain()

		require.Equal(t, []string{"customers-read", "instances-read", "licenses-read"}, restUsage)
		require.Equal(t, restUsage, graphqlUsage)
	})

	t.Run("WhenTraversingLicenseEntitlements_ReportsSameUsageAsRESTEquivalent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		server, reporter := meteredServer(t)

		license := newLicense(t, "Metering Grant License")
		entitlement := newPresentedEntitlement(t, "metering-seats", 10)
		associateNumberEntitlement(t, license.Slug, entitlement.Slug, 10)

		getREST(t, server, "/api/licenses")
		getREST(t, server, "/api/licenses/"+license.Slug+"/entitlements")
		getREST(t, server, "/api/entitlements/"+entitlement.Slug)
		restUsage := reporter.drain()

		postGraphQL(t, server, `{
			licenses {
				items {
					id
					entitlements {
						entitlementSlug
						entitlement { slug }
					}
				}
			}
		}`)
		graphqlUsage := reporter.drain()

		require.Equal(t, []string{"entitlements-read", "license-entitlements-read", "licenses-read"}, restUsage)
		require.Equal(t, restUsage, graphqlUsage)
	})

	// License.family is part of the license it hangs off, as familyId is part
	// of the REST representation: selecting it must not bill a second
	// license read on top of the one the root resolver already reports.
	t.Run("WhenSelectingALicensesFamily_ReportsNoReadOfItsOwn", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		server, reporter := meteredServer(t)

		license := newLicense(t, "Metering Family License")

		getREST(t, server, "/api/license-families/"+license.Slug)
		restUsage := reporter.drain()
		require.Equal(t, []string{"licenses-read"}, restUsage)

		queries := []string{
			`{ licenseFamily(slug: "` + license.Slug + `") { currentVersion { family { slug } } } }`,
			`{ license(slug: "` + license.Slug + `") { family { id slug } } }`,
			`{ licenses { items { family { slug } } } }`,
		}
		for _, query := range queries {
			postGraphQL(t, server, query)
			require.Equal(t, restUsage, reporter.drain(), "usage of %s", query)
		}
	})
}

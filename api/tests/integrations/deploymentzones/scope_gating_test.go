package deploymentzones_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestDeploymentZonesScopeGating asserts that every mutating deployment-zones
// endpoint rejects a caller that holds only the read scope. It pins the
// write:deploymentZones requirement — notably on PUT, which previously shipped
// without it — so losing it again breaks loudly. Scope is
// required by the facade method before it runs the use case, so a non-existent slug
// still yields 403 rather than 404: authorization decides first, and only then does
// the answer depend on what exists.
func TestDeploymentZonesScopeGating(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	// Separate server bound to the same DB but with a read-only principal; we
	// don't mutate the permissive testServer other subtests rely on.
	readOnlyServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		Scopes: []string{scope.Read(scope.DeploymentZones)},
	})

	zone := map[string]any{
		"name":        "Zone",
		"type":        "region",
		"description": "",
	}

	cases := []struct {
		name   string
		method string
		path   string
		body   any
	}{
		{name: "POST /deployment-zones", method: "POST", path: "/api/deployment-zones", body: zone},
		{name: "PUT /deployment-zones/{slug}", method: "PUT", path: "/api/deployment-zones/any-slug", body: zone},
		{name: "DELETE /deployment-zones/{slug}", method: "DELETE", path: "/api/deployment-zones/any-slug", body: nil},
	}

	for _, tc := range cases {
		t.Run(tc.name+" without write scope returns 403", func(t *testing.T) {
			req := commonfixture.NewJSONRequest(t, tc.method, tc.path, tc.body)
			resp, err := readOnlyServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, resp.Body)
			assert.Equal(t, fiber.StatusForbidden, resp.StatusCode)
		})
	}

	t.Run("GET /deployment-zones with only read scope still works", func(t *testing.T) {
		req := commonfixture.NewJSONRequest(t, "GET", "/api/deployment-zones", nil)
		resp, err := readOnlyServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	})
}

package metadatafields_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestMetadataFieldsScopeGating asserts that the write endpoints of the
// metadatafields module reject a caller that holds read scopes but not the
// write:metadata_fields scope.
//
// Per the README, "admin-only" is implemented at the scope level
// rather than via an explicit org-role check (the codebase has no role
// concept today). This test pins the gating behavior so a future regression --
// a facade method that stops calling caller.Require, or an endpoint that stops
// going through the facade -- breaks loudly.
func TestMetadataFieldsScopeGating(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	// Spin up a second server bound to the same DB but with a principal
	// that holds only the read scope. We don't mutate testServer because
	// other subtests rely on it being permissive.
	readOnlyServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		Scopes: []string{scope.Read(scope.MetadataFields)},
	})

	cases := []struct {
		name   string
		method string
		path   string
		body   any
	}{
		{
			name:   "POST /metadata-fields",
			method: "POST",
			path:   "/api/metadata-fields",
			body: map[string]any{
				"resourceType": "DEPLOYMENT_ZONE",
				"key":          "region",
				"label":        "Region",
				"jsonSchema":   map[string]any{"type": "string"},
				"displayOrder": 0,
			},
		},
		{
			name:   "PATCH /metadata-fields/{id}",
			method: "PATCH",
			path:   "/api/metadata-fields/00000000-0000-0000-0000-000000000000",
			// resourceType and key are required on this schema (echoed back,
			// since both are immutable -- see schema.MetadataField's doc
			// comment); displayOrder is optional and deliberately omitted
			// here, since it is never updatable through this endpoint (see
			// command.go). A body carrying displayOrder is answered 422
			// rather than 403 -- pinned as its own case below.
			body: map[string]any{
				"label":        "X",
				"jsonSchema":   map[string]any{"type": "string"},
				"resourceType": "DEPLOYMENT_ZONE",
				"key":          "region",
			},
		},
		{
			name:   "POST /metadata-fields/{id}/archive",
			method: "POST",
			path:   "/api/metadata-fields/00000000-0000-0000-0000-000000000000/archive",
			body:   nil,
		},
		{
			name:   "POST /metadata-fields/{id}/unarchive",
			method: "POST",
			path:   "/api/metadata-fields/00000000-0000-0000-0000-000000000000/unarchive",
			body:   nil,
		},
		{
			name:   "POST /metadata-fields/reorder",
			method: "POST",
			path:   "/api/metadata-fields/reorder",
			body:   map[string]any{"ids": []string{"00000000-0000-0000-0000-000000000000"}},
		},
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

	// The order in which a request that is wrong twice gets answered.
	//
	// Scope is enforced in the facade method the handler calls, so it is enforced
	// after huma has parsed and validated the body -- there is no authorization
	// middleware in front of the handler any more, by design (one enforcement point,
	// reachable from every driver). An under-scoped caller sending a body that fails
	// validation therefore learns that its body was invalid, not that it lacked the
	// scope.
	//
	// Pinned rather than merely tolerated, because it is an observable change from
	// the middleware ordering and someone will eventually read the 422 as a bug. The
	// disclosure it represents is bounded: the schema the validator applied is
	// published in app/openapi.yaml, which is served publicly, so a 422 tells a
	// caller only what it could already read -- and it reveals nothing about this
	// organization's data, which is what the scope protects. If that ever stops being
	// true for some operation, the fix is that operation's, not a second enforcement
	// point in front of all 100.
	t.Run("PATCH /metadata-fields/{id} without write scope and an invalid body returns 422", func(t *testing.T) {
		// resourceType and key are deliberately omitted -- both are required
		// on this schema (see the table case above), so this is still an
		// invalid body under the current contract, just for a different
		// structural reason than before this fold.
		req := commonfixture.NewJSONRequest(t, "PATCH",
			"/api/metadata-fields/00000000-0000-0000-0000-000000000000",
			map[string]any{
				"label":        "X",
				"jsonSchema":   map[string]any{"type": "string"},
				"displayOrder": 0,
			})
		resp, err := readOnlyServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode,
			"validation runs before the facade, so the invalid body is what the caller is told about")
	})

	t.Run("GET /metadata-fields with only read scope still works", func(t *testing.T) {
		req := commonfixture.NewJSONRequest(t, "GET", "/api/metadata-fields?resourceType=DEPLOYMENT_ZONE", nil)
		resp, err := readOnlyServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	})
}

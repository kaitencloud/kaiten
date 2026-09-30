package platformapi_test

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// The invisibility suite (F6).
//
// Making system:kaiten a machine user with a membership in every organization is
// what lets it act inside a tenant at all -- and it is also the one thing in this
// design that could open a hole, because the service-account queries resolved a
// machine user through user_on_organization alone. With a membership everywhere,
// that would have made the platform identity listable, fetchable and
// token-mintable from every tenant's Core API.
//
// The fix is a predicate (u.organization_id = uoo.organization_id) that is a
// provable no-op for real service accounts and excludes exactly the orgless
// platform identity. These tests are what hold it in place.

type serviceAccountList struct {
	Items []struct {
		Slug       string `json:"slug"`
		ExternalID string `json:"externalId"`
		Name       string `json:"name"`
	} `json:"items"`
}

// tokenList is compared whole between two responses, so it deliberately carries
// no fields: the assertion is that the two pages are the same page, and any field
// listed here would only narrow what "the same" means.
type tokenList struct {
	Items      []map[string]any `json:"items"`
	HasMore    bool             `json:"hasMore"`
	NextCursor *string          `json:"nextCursor"`
}

// TestPlatformIdentityIsNotListedInAnyOrganization checks two tenants, not one.
// A membership-only query would leak the identity into every organization
// equally, so a single-tenant assertion could pass for the wrong reason (an empty
// list, a pagination quirk) and still be leaking next door.
func TestPlatformIdentityIsNotListedInAnyOrganization(t *testing.T) {
	neighbour := createOrganization(t)
	neighbourServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		OrganizationID: &neighbour,
	})

	for name, server := range map[string]*tests.TestServer{
		"default organization":      organizationServer,
		"neighbouring organization": neighbourServer,
	} {
		t.Run(name, func(t *testing.T) {
			request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/service-accounts", nil)

			response, err := server.App.Test(request, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, response.Body)

			body := commonfixture.AssertJSONResponse[serviceAccountList](t, response, http.StatusOK)
			for _, item := range body.Items {
				require.NotEqual(t, platformidentity.Slug, item.Slug,
					"the platform identity is listed as a service account")
				require.NotEqual(t, platformidentity.ExternalID, item.ExternalID,
					"the platform identity is listed as a service account")
			}
		})
	}
}

// TestPlatformIdentityCannotBeAddressedFromATenant covers the operations that
// take a slug: not listed is necessary but not sufficient, because a caller that
// knows the slug could still name it directly. The slug is a documented constant,
// so "hard to guess" is not a defence.
//
// 404 rather than 403 is the right answer here: from inside a tenant, this
// service account genuinely does not exist. A 403 would confirm that it does.
func TestPlatformIdentityCannotBeAddressedFromATenant(t *testing.T) {
	testCases := []struct {
		name   string
		method string
		path   string
		body   any
	}{
		{
			name:   "fetch",
			method: http.MethodGet,
			path:   "/api/service-accounts/" + platformidentity.Slug,
			body:   nil,
		},
		{
			name:   "mint a token on it",
			method: http.MethodPost,
			path:   "/api/service-accounts/" + platformidentity.Slug + "/tokens",
			body:   map[string]any{"name": "stolen", "scopes": []string{"read:customers"}},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := commonfixture.NewJSONRequest(t, testCase.method, testCase.path, testCase.body)

			response, err := organizationServer.App.Test(request, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, response.Body)

			require.Equal(t, http.StatusNotFound, response.StatusCode,
				"%s %s reached the platform identity from inside a tenant",
				testCase.method, testCase.path)
		})
	}
}

// TestPlatformIdentityTokensAreNotListableFromATenant covers the one
// service-account operation that does NOT resolve its owner:
// getserviceaccounttokens filters tokens by slug and organization_id, so an
// unknown slug yields 200 with an empty page rather than a 404. Asserting 404
// here would be asserting something the endpoint has never done for any slug.
//
// What has to hold instead is indistinguishability -- the platform identity must
// look exactly like a slug that was never created. That is not free: an org token
// minted for system:kaiten by the Platform API carries this organization's id, so
// without the u.organization_id = t.organization_id predicate on the listing
// queries it would appear here, under an owner this same tenant gets a 404 for.
func TestPlatformIdentityTokensAreNotListableFromATenant(t *testing.T) {
	paths := map[string]string{
		"the platform identity": "/api/service-accounts/" + platformidentity.Slug + "/tokens",
		"a slug that was never created": "/api/service-accounts/" +
			"absent-" + uuid.NewString() + "/tokens",
	}

	bodies := map[string]tokenList{}
	statuses := map[string]int{}

	for name, path := range paths {
		request := commonfixture.NewJSONRequest(t, http.MethodGet, path, nil)

		response, err := organizationServer.App.Test(request, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, response.Body)

		statuses[name] = response.StatusCode
		bodies[name] = commonfixture.AssertJSONResponse[tokenList](t, response, http.StatusOK)
	}

	require.Equal(t, statuses["a slug that was never created"], statuses["the platform identity"],
		"the platform identity's token list is distinguishable from an unknown slug's")
	require.Empty(t, bodies["the platform identity"].Items,
		"a tenant can list the platform identity's tokens")
	require.Equal(t, bodies["a slug that was never created"], bodies["the platform identity"],
		"the platform identity's token list is distinguishable from an unknown slug's")
}

// TestPlatformIdentityHasAMembershipInEveryOrganization is the other half of the
// same coin, and it has to be asserted alongside the invisibility tests: the
// membership is what the mint depends on, so a change that made these tests pass
// by simply removing the membership would break the feature while looking like a
// security improvement.
func TestPlatformIdentityHasAMembershipInEveryOrganization(t *testing.T) {
	neighbour := createOrganization(t)

	for name, organizationID := range map[string]any{
		"pre-existing organization":  testDb.DefaultData.OrganizationID,
		"newly created organization": neighbour,
	} {
		t.Run(name, func(t *testing.T) {
			var count int
			require.NoError(t, testDb.DbPool.QueryRow(t.Context(), `
				SELECT count(*)
				FROM user_on_organization uoo
				JOIN "user" u ON u.id = uoo.user_id
				WHERE u.external_id = $1
				  AND uoo.organization_id = $2
				  AND uoo.deleted_at IS NULL`,
				platformidentity.ExternalID, organizationID).Scan(&count))

			require.Equal(t, 1, count,
				"the platform identity has no live membership in this organization; the mint would 409")
		})
	}
}

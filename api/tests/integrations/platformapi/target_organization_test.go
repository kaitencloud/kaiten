package platformapi_test

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	usersdb "github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/targetorg"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestOneCredentialAnswersPerTargetOrganization is the integration form of the
// actor-versus-target distinction. The unit tests in
// internal/infrastructure/http/huma prove the middleware never writes to the
// Principal; this proves the consequence end to end, through the real server and
// a real route: one credential, two targets, two different tenants in the two
// answers.
//
// If anything on this path resolved the tenant from the credential rather than
// from the path -- the forbidden Principal.OrganizationID = path.orgId -- one of
// these two requests would have to be wrong, because the credential is the same
// object in both.
func TestOneCredentialAnswersPerTargetOrganization(t *testing.T) {
	t.Cleanup(func() { resetDatabase(t) })

	first := createOrganization(t)
	second := createOrganization(t)

	firstBody := getOrganizationAsPlatform(t, first)
	secondBody := getOrganizationAsPlatform(t, second)

	require.Equal(t, first.String(), firstBody["id"])
	require.Equal(t, second.String(), secondBody["id"])
	require.NotEqual(t, firstBody["id"], secondBody["id"],
		"one credential returned the same organization for two different targets")
}

// TestTargetOrganizationSelectsTheTenant goes one step past reading: it mutates,
// and the mutation has to land in the tenant named in the path and nowhere else.
// The membership exists in `second` only, so the request against `first` must
// find nothing -- and the identical request against `second` must succeed, which
// is what rules out "it 404s for some other reason".
func TestTargetOrganizationSelectsTheTenant(t *testing.T) {
	t.Cleanup(func() { resetDatabase(t) })

	first := createOrganization(t)
	second := createOrganization(t)
	userID := createMemberUser(t, second)

	missing := commonfixture.NewJSONRequest(t, http.MethodDelete,
		"/api/platform/organizations/"+first.String()+"/memberships/"+userID.String(), nil)
	missingResponse, err := platformServer.PlatformApp.Test(missing, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, missingResponse.Body)

	require.Equal(t, http.StatusNotFound, missingResponse.StatusCode,
		"a membership in another organization was reachable through this target")

	present := commonfixture.NewJSONRequest(t, http.MethodDelete,
		"/api/platform/organizations/"+second.String()+"/memberships/"+userID.String(), nil)
	presentResponse, err := platformServer.PlatformApp.Test(present, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, presentResponse.Body)

	require.Equal(t, http.StatusNoContent, presentResponse.StatusCode,
		"the membership was not reachable through its own organization either")
}

// TestUnknownTargetOrganizationIs404 pins the existence check every {orgId}
// operation performs before its own logic begins. Without it, a use case would be
// asked to act inside a tenant that does not exist and would answer whatever its
// own query happened to return.
//
// Asserted through the router, so it holds wherever the check lives. It moved from
// a middleware into kaiten.Platform.bindTarget and this test did not change, which
// is the property worth having: the answer is a contract, its location is not.
func TestUnknownTargetOrganizationIs404(t *testing.T) {
	t.Cleanup(func() { resetDatabase(t) })

	request := commonfixture.NewJSONRequest(t, http.MethodGet,
		"/api/platform/organizations/"+uuid.NewString(), nil)
	response, err := platformServer.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	body := commonfixture.AssertJSONResponse[map[string]any](t, response, http.StatusNotFound)
	require.Equal(t, targetorg.ErrCodeNotFound, body["code"])
}

// TestGetOrganizationIsGoneFromTheCoreAPI is get-organization's half of the
// removal. Asserted with an organization credential, the one this surface actually
// serves, so the 404 is a statement about the route table and not about which
// credential class the route would have accepted.
func TestGetOrganizationIsGoneFromTheCoreAPI(t *testing.T) {
	t.Cleanup(func() { resetDatabase(t) })

	organizationID := createOrganization(t)

	request := commonfixture.NewJSONRequest(t, http.MethodGet,
		"/api/organizations/"+organizationID.String(), nil)
	response, err := organizationServer.App.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	require.Equal(t, http.StatusNotFound, response.StatusCode,
		"get-organization is still reachable on the Core API")
}

// TestGetOrganizationStillRequiresItsScope checks that moving the operation did
// not drop its scope on the way. Being on the Platform API is one requirement;
// read:organizations is still the other.
func TestGetOrganizationStillRequiresItsScope(t *testing.T) {
	t.Cleanup(func() { resetDatabase(t) })

	organizationID := createOrganization(t)

	scopelessServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		PlatformCredential: true,
		PlatformTokenID:    platformTokenID,
		Scopes:             []string{scope.Read(scope.Tokens)},
	})

	request := commonfixture.NewJSONRequest(t, http.MethodGet,
		"/api/platform/organizations/"+organizationID.String(), nil)
	response, err := scopelessServer.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	require.Equal(t, http.StatusForbidden, response.StatusCode,
		"a platform credential without read:organizations read an organization")
}

func getOrganizationAsPlatform(t *testing.T, organizationID uuid.UUID) map[string]any {
	t.Helper()

	request := commonfixture.NewJSONRequest(t, http.MethodGet,
		"/api/platform/organizations/"+organizationID.String(), nil)
	response, err := platformServer.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	return commonfixture.AssertJSONResponse[map[string]any](t, response, http.StatusOK)
}

// createMemberUser makes a user and gives it a membership in one organization
// only, which is what lets the target-selection test tell the two tenants apart.
func createMemberUser(t *testing.T, organizationID uuid.UUID) uuid.UUID {
	t.Helper()

	email := "member-" + uuid.NewString() + "@example.com"
	user, err := usersdb.New(testDb.DbPool).CreateUser(t.Context(), usersdb.CreateUserParams{
		ID:         nil,
		ExternalID: "ext-" + uuid.NewString(),
		Email:      &email,
		Name:       "Target Selection Member",
	})
	require.NoError(t, err)

	_, err = organizationdb.New(testDb.DbPool).CreateUserOnOrganization(t.Context(),
		organizationdb.CreateUserOnOrganizationParams{
			UserID:         user.ID,
			OrganizationID: organizationID,
		})
	require.NoError(t, err)

	return user.ID
}

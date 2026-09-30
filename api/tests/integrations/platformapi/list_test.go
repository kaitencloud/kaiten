package platformapi_test

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/mintorganizationtoken"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// The reason this endpoint exists: revocation is addressed by slug, a slug is
// server-generated with a random suffix, and a client that minted a credential
// holds only the NAME it chose. Without a way back from one to the other, a
// credential could be created and never retired -- and re-minting under the same
// name is refused, so the caller is stuck.
func TestListingFindsTheSlugOfACredentialByTheNameItWasMintedWith(t *testing.T) {
	organizationID := createOrganization(t)

	minted := mintAsPlatform(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "onboarding-service"})

	listed := listAsPlatform(t, platformServer, organizationID)

	var found *schema.Token
	for i := range listed {
		if listed[i].Name == "onboarding-service" {
			found = &listed[i]

			break
		}
	}

	require.NotNil(t, found, "the credential this caller just minted is not in its own list")
	assert.Equal(t, minted.Slug, found.Slug,
		"the listed slug does not address the credential that was minted")

	// The whole point: that slug is now usable for revocation.
	assert.Equal(t, http.StatusNoContent,
		revokeAsPlatform(t, platformServer, organizationID, found.Slug))
}

// The listing must never carry anything that could be used AS the credential. It
// identifies for revocation; it does not authenticate.
//
// Asserted on the WIRE rather than on the model. schema.Token has no field for a
// value -- only schema.PlainToken does -- so a Go-level assertion would only be
// restating the type. What is worth pinning is that the response body itself
// carries no `token` key, which is what would actually leak if this operation
// were ever switched to the PlainToken component the mint returns.
func TestListingPublishesNoCredentialValue(t *testing.T) {
	organizationID := createOrganization(t)

	mintAsPlatform(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "valueless"})

	request := commonfixture.NewJSONRequest(t, http.MethodGet,
		"/api/platform/organizations/"+organizationID.String()+"/tokens", nil)
	response, err := platformServer.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	raw := commonfixture.AssertJSONResponse[[]map[string]any](t, response, http.StatusOK)
	require.NotEmpty(t, raw)

	for _, listed := range raw {
		assert.NotContains(t, listed, "token",
			"a credential value reached the listing, which would make this endpoint a way to steal one")
	}
}

// Revoked credentials leave the listing, or a caller would keep trying to revoke
// a slug that is already retired -- and, worse, would read a retired credential
// as still serving its consumer.
func TestListingOmitsRevokedCredentials(t *testing.T) {
	organizationID := createOrganization(t)

	minted := mintAsPlatform(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "retired"})
	require.Equal(t, http.StatusNoContent,
		revokeAsPlatform(t, platformServer, organizationID, minted.Slug))

	for _, listed := range listAsPlatform(t, platformServer, organizationID) {
		assert.NotEqual(t, minted.Slug, listed.Slug, "a revoked credential is still listed")
	}
}

// Scoped to the target, exactly like the revoke. A platform credential acting in
// one tenant must not be able to see what it issued in another -- the listing
// would otherwise be a way to enumerate across tenants with a single call.
func TestListingIsScopedToTheTargetOrganization(t *testing.T) {
	first := createOrganization(t)
	second := createOrganization(t)

	mintAsPlatform(t, platformServer, first,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "only-in-first"})

	for _, listed := range listAsPlatform(t, platformServer, second) {
		assert.NotEqual(t, "only-in-first", listed.Name,
			"a credential minted in another organization is visible here")
	}
}

// An organization this caller has minted nothing in answers with an empty list
// rather than a 404 or a null body: "I hold nothing here" is an answer, and a
// client that checks for a body would read null as a failure.
func TestListingAnEmptyOrganizationIsAnEmptyList(t *testing.T) {
	organizationID := createOrganization(t)

	listed := listAsPlatform(t, platformServer, organizationID)

	assert.NotNil(t, listed, "an empty listing must be [] rather than null")
	assert.Empty(t, listed)
}

func listAsPlatform(t *testing.T, server *tests.TestServer, organizationID uuid.UUID) []schema.Token {
	t.Helper()

	request := commonfixture.NewJSONRequest(t, http.MethodGet,
		"/api/platform/organizations/"+organizationID.String()+"/tokens", nil)
	response, err := server.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	return commonfixture.AssertJSONResponse[[]schema.Token](t, response, http.StatusOK)
}

package currentuser

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// GetUser is the choke point that keeps ~570 unguarded `.OrganizationID`
// dereferences safe: it is the only way a handler obtains an organization to act
// in, so refusing here is what makes a platform credential structurally unable
// to reach organization-scoped code without touching those call sites.
func TestContextUserProvider_GetUser(t *testing.T) {
	provider := &ContextUserProvider{}

	t.Run("no identity in context is unauthenticated", func(t *testing.T) {
		user, err := provider.GetUser(context.Background())

		require.Nil(t, user)
		assertProblem(t, err, http.StatusUnauthorized, "CurrentUser.NoIdentityInContext")
	})

	t.Run("organization principal yields its actor", func(t *testing.T) {
		userID, organizationID := uuid.New(), uuid.New()
		ctx := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
			Kind:           principal.KindOrganization,
			UserID:         userID,
			OrganizationID: organizationID,
		})

		user, err := provider.GetUser(ctx)

		require.NoError(t, err)
		require.NotNil(t, user)
		assert.Equal(t, userID, user.ID)
		assert.Equal(t, organizationID, user.OrganizationID)
	})

	// A platform principal carries a real UserID, so without this branch GetUser
	// would happily return a User whose OrganizationID is uuid.Nil -- and every
	// caller would then scope its queries to the zero UUID instead of failing.
	t.Run("platform principal is refused rather than given a nil organization", func(t *testing.T) {
		ctx := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
			Kind:            principal.KindPlatform,
			UserID:          uuid.New(),
			PlatformTokenID: uuid.New(),
		})

		user, err := provider.GetUser(ctx)

		require.Nil(t, user, "no User may be produced for a credential with no organization context")
		assertProblem(t, err, http.StatusForbidden, "CurrentUser.PlatformPrincipalHasNoOrganization")
	})

	// system:kaiten acting inside one organization. Admitted because internal/kaiten
	// resolved both ids from the database before binding the principal -- which is
	// what makes this different from the platform case above, where the credential
	// genuinely establishes no organization.
	t.Run("system principal yields the resolved actor and organization", func(t *testing.T) {
		userID, organizationID := uuid.New(), uuid.New()
		ctx := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
			Kind:           principal.KindSystem,
			UserID:         userID,
			OrganizationID: organizationID,
		})

		user, err := provider.GetUser(ctx)

		require.NoError(t, err)
		require.NotNil(t, user)
		assert.Equal(t, userID, user.ID)
		assert.Equal(t, organizationID, user.OrganizationID)
	})

	// The kind alone is not the admission: a system principal is built from a
	// database resolution, so one arriving without an organization is a wiring bug
	// rather than a credential class, and it is refused instead of scoping queries
	// to the zero UUID.
	t.Run("system principal with no organization is refused", func(t *testing.T) {
		ctx := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
			Kind:   principal.KindSystem,
			UserID: uuid.New(),
		})

		user, err := provider.GetUser(ctx)

		require.Nil(t, user)
		assertProblem(t, err, http.StatusForbidden, "CurrentUser.SystemPrincipalIsIncomplete")
	})

	// The same refusal for the other half. system:kaiten is a real user row, so a
	// system principal that names no actor never came from the resolver.
	t.Run("system principal with no actor is refused", func(t *testing.T) {
		ctx := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
			Kind:           principal.KindSystem,
			OrganizationID: uuid.New(),
		})

		user, err := provider.GetUser(ctx)

		require.Nil(t, user)
		assertProblem(t, err, http.StatusForbidden, "CurrentUser.SystemPrincipalIsIncomplete")
	})

	// The runtime floor under the credential-free surface, which binds KindUnset. It is
	// also a hole this closes on its own: before the switch above tested for the
	// organization kind positively, a Principal nobody assigned a kind to fell
	// through and produced a User scoped to the zero UUID.
	t.Run("principal with no credential kind is refused", func(t *testing.T) {
		ctx := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
			Kind: principal.KindUnset,
		})

		user, err := provider.GetUser(ctx)

		require.Nil(t, user, "an absent credential class must not yield an organization to act in")
		assertProblem(t, err, http.StatusForbidden, "CurrentUser.NoOrganizationContext")
	})
}

func assertProblem(t *testing.T, err error, status int, code string) {
	t.Helper()

	var apiErr *kaitenerrors.Error
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, status, apiErr.HTTPStatus())
	assert.Equal(t, code, apiErr.ErrorCode())
}

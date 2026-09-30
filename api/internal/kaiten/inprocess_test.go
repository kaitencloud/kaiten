package kaiten

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// These tests are about the two properties the in-process surface leans on that no
// other layer can assert: that its binding authenticates nothing, and that the
// caller check happens before the use case is reached.
//
// Everything else about this surface is guarded from outside -- the call-site
// allowlist and package purity live in tests/architecture, because they are
// statements about the whole tree. What is left here is what only a package-internal
// test can see: bindInProcess is unexported, and so is the fact that a refused call
// never touches a module.

func TestBindInProcess_AuthenticatesNothing(t *testing.T) {
	t.Parallel()

	ctx := bindInProcess(context.Background())

	actor, ok := principal.FromContext(ctx)
	require.True(t, ok, "a use case reading the principal would see nothing at all")

	assert.Equal(t, principal.KindUnset, actor.Kind,
		"an in-process call acquired a credential class, and would be accepted by a transport surface")
	assert.Equal(t, uuid.Nil, actor.UserID)
	assert.Equal(t, uuid.Nil, actor.OrganizationID)
	assert.Equal(t, uuid.Nil, actor.PlatformTokenID)
	assert.Empty(t, actor.Scopes, "an in-process caller holds no credential, so it can carry no scopes")
	assert.Empty(t, actor.Token, "nothing below the facade reads the raw credential")
}

// The case that matters most in practice. JIT provisioning runs midway through
// resolving a request's own principal, so the context handed to EnsureUser already
// carries one -- and inheriting it would let a use case that must be
// unauthenticated act as whoever was calling. Overwriting the slot is what makes
// "in-process is unauthenticated" true regardless of where the context came from.
func TestBindInProcess_ErasesAnAmbientPrincipal(t *testing.T) {
	t.Parallel()

	requestScope := scope.Read(scope.Customers)
	ambient := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
		Kind:           principal.KindOrganization,
		UserID:         uuid.New(),
		OrganizationID: uuid.New(),
		Scopes:         []string{requestScope},
		Token:          "ksh_whatever",
	})

	actor, ok := principal.FromContext(bindInProcess(ambient))
	require.True(t, ok)

	assert.Equal(t, principal.KindUnset, actor.Kind)
	assert.Equal(t, uuid.Nil, actor.UserID)
	assert.Equal(t, uuid.Nil, actor.OrganizationID)
	assert.Empty(t, actor.Scopes)
	assert.Empty(t, actor.Token)
}

// The methods on this surface take no caller, so there is no unauthorized-caller
// case to test.

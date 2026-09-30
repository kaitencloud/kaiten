package kaiten

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/deleteorganization"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/platform/targetorg"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// These tests are about the difference between acting AS an organization and
// acting ON one. bindTarget's job is to establish the second without ever
// producing the first, so most of what follows asserts what did *not* happen.

// stubResolver records what it was asked, which is how the ordering tests can
// assert that authorization ran first: an existence check that never happened
// cannot have leaked whether a tenant exists.
type stubResolver struct {
	exists bool
	err    error
	calls  []uuid.UUID
}

func (s *stubResolver) OrganizationExists(_ context.Context, organizationID uuid.UUID) (bool, error) {
	s.calls = append(s.calls, organizationID)
	return s.exists, s.err
}

// platformSurface builds the smallest Platform that can answer bindTarget: the
// organization module's existence port and nothing else. Every other field stays
// nil deliberately -- a test that reached a use case through one of them would be
// an integration test wearing this one's clothes.
func platformSurface(resolver *stubResolver) Platform {
	return Platform{org: &organization.UseCases{TargetOrganization: resolver}}
}

// theScope is one real RequiredScope rather than a literal, so the tests exercise
// the same value the registrar publishes. Which one does not matter: bindTarget
// takes it as an argument.
var theScope = deleteorganization.RequiredScope

func platformCaller() caller.PlatformCaller {
	return caller.LocalPlatform([]string{theScope})
}

func TestBindTarget_SetsTheTargetWithoutGivingTheCallerAnOrganization(t *testing.T) {
	t.Parallel()

	organizationID := uuid.New()
	resolver := &stubResolver{exists: true}

	ctx, err := platformSurface(resolver).bindTarget(
		context.Background(), platformCaller(), theScope, organizationID)

	require.NoError(t, err)
	assert.Equal(t, []uuid.UUID{organizationID}, resolver.calls)

	target, ok := targetorg.FromContext(ctx)
	require.True(t, ok, "the use case would see no target organization")
	assert.Equal(t, organizationID, target)

	actor, ok := principal.FromContext(ctx)
	require.True(t, ok)
	assert.Equal(t, principal.KindPlatform, actor.Kind)
	assert.Equal(t, uuid.Nil, actor.OrganizationID,
		"the target was written into the actor's execution context")
	assert.Equal(t, uuid.Nil, actor.UserID,
		"a platform credential authenticates no user")
}

// One caller against two different targets. If the target were folded into the
// principal, the second call would inherit the first organization -- and a
// platform credential would have acquired an execution context by being used
// twice.
func TestBindTarget_OneCallerTwoTargets(t *testing.T) {
	t.Parallel()

	first, second := uuid.New(), uuid.New()
	surface := platformSurface(&stubResolver{exists: true})
	cl := platformCaller()

	firstCtx, err := surface.bindTarget(context.Background(), cl, theScope, first)
	require.NoError(t, err)

	secondCtx, err := surface.bindTarget(context.Background(), cl, theScope, second)
	require.NoError(t, err)

	firstTarget, _ := targetorg.FromContext(firstCtx)
	secondTarget, _ := targetorg.FromContext(secondCtx)

	assert.Equal(t, first, firstTarget)
	assert.Equal(t, second, secondTarget)

	firstActor, _ := principal.FromContext(firstCtx)
	secondActor, _ := principal.FromContext(secondCtx)
	assert.Equal(t, uuid.Nil, firstActor.OrganizationID)
	assert.Equal(t, uuid.Nil, secondActor.OrganizationID)
}

func TestBindTarget_UnknownOrganizationIs404(t *testing.T) {
	t.Parallel()

	ctx, err := platformSurface(&stubResolver{exists: false}).bindTarget(
		context.Background(), platformCaller(), theScope, uuid.New())

	require.Nil(t, ctx, "a refused call must not hand back a context a use case could run under")
	assertProblem(t, err, http.StatusNotFound, targetorg.ErrCodeNotFound)
}

// uuid.Nil parses, so nothing upstream refuses it, and it is the one target value
// targetorg cannot represent -- it is what "no target" already means. Accepting it
// would install a context whose target reads as absent to everything downstream.
func TestBindTarget_TheNilUUIDIsRefused(t *testing.T) {
	t.Parallel()

	resolver := &stubResolver{exists: true}

	ctx, err := platformSurface(resolver).bindTarget(
		context.Background(), platformCaller(), theScope, uuid.Nil)

	require.Nil(t, ctx)
	assertProblem(t, err, http.StatusBadRequest, targetorg.ErrCodeInvalid)
	assert.Empty(t, resolver.calls, "the nil uuid was looked up")
}

// "Not there" and "could not find out" must not share an answer. Reporting a
// failed lookup as 404 would tell every caller during a database incident that
// their tenant had been deleted.
func TestBindTarget_ResolverFailureIsNotA404(t *testing.T) {
	t.Parallel()

	ctx, err := platformSurface(&stubResolver{err: assert.AnError}).bindTarget(
		context.Background(), platformCaller(), theScope, uuid.New())

	require.Nil(t, ctx)
	assertProblem(t, err, http.StatusInternalServerError, targetorg.ErrCodeUnavailable)
	require.ErrorIs(t, err, assert.AnError,
		"the cause must stay wrapped, or the incident is invisible in logs")
}

// Authorization precedes the existence check. Otherwise the facade would answer
// 404-or-not to callers not yet known to be allowed to ask, turning every
// operation in the namespace into an organization-enumeration oracle.
func TestBindTarget_RunsAfterAuthorization(t *testing.T) {
	t.Parallel()

	for name, tc := range map[string]struct {
		caller       caller.PlatformCaller
		expectedCode string
		status       int
	}{
		"missing scope": {
			caller:       caller.LocalPlatform([]string{scope.Read(scope.Customers)}),
			expectedCode: scope.ErrCodeMissingScope,
			status:       http.StatusForbidden,
		},
		// A caller nobody constructed holds no scopes, so it is refused for the same
		// reason and with the same answer as one whose scopes are wrong -- and
		// before the organization is looked up.
		"no credential at all": {
			caller:       caller.PlatformCaller{},
			expectedCode: scope.ErrCodeMissingScope,
			status:       http.StatusForbidden,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			resolver := &stubResolver{exists: true}

			ctx, err := platformSurface(resolver).bindTarget(
				context.Background(), tc.caller, theScope, uuid.New())

			require.Nil(t, ctx)
			assertProblem(t, err, tc.status, tc.expectedCode)
			assert.Empty(t, resolver.calls,
				"the organization was looked up for an unauthorized caller")
		})
	}
}

func assertProblem(t *testing.T, err error, status int, code string) {
	t.Helper()

	var apiErr *kaitenerrors.Error
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, status, apiErr.HTTPStatus())
	assert.Equal(t, code, apiErr.ErrorCode())
}

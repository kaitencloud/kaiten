package caller

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// Organization and Platform are the credential-class check, for every driver and
// with nothing duplicating them, so what these assert is not parity with a second
// implementation but the rule itself. The same rules observed from outside a running
// surface -- including that
// principal.KindUnset is refused on both -- are in
// internal/infrastructure/http/huma/credential_kind_test.go; these name the
// constants, so a refusal's code and message cannot drift into agreeing literals.
func TestOrganization(t *testing.T) {
	t.Run("carries the principal's actor, organization and scopes", func(t *testing.T) {
		userID, organizationID := uuid.New(), uuid.New()
		ctx := organizationContext(userID, organizationID, scope.Read(scope.Customers))

		c, err := Organization(ctx)

		require.NoError(t, err)
		assert.Equal(t, userID, c.UserID())
		assert.Equal(t, organizationID, c.OrganizationID())
		assert.Equal(t, []string{scope.Read(scope.Customers)}, c.Scopes())
	})

	t.Run("no principal is 401", func(t *testing.T) {
		_, err := Organization(context.Background())

		assertProblem(t, err, http.StatusUnauthorized, scope.ErrCodeNoIdentity, scope.ErrMsgNoIdentity)
	})

	t.Run("platform principal is 403", func(t *testing.T) {
		_, err := Organization(platformContext(uuid.New()))

		assertProblem(t, err, http.StatusForbidden,
			principal.ErrCodeWrongCredentialKind, principal.ErrMsgWrongCredentialKind)
	})

	// A system principal names a real organization, which is precisely why it has to
	// be refused HERE rather than left to look like an organization credential: it
	// carries no scopes and nobody presented anything for it, so admitting it would
	// let work Kaiten does on its own behalf answer as though a tenant had asked.
	// The answer is the class refusal, not a new one -- see the KindUnset case below.
	t.Run("system principal is 403", func(t *testing.T) {
		_, err := Organization(systemContext())

		assertProblem(t, err, http.StatusForbidden,
			principal.ErrCodeWrongCredentialKind, principal.ErrMsgWrongCredentialKind)
	})

	// KindUnset is the absence of a credential class, not a third class of one, so
	// it is refused here exactly as a platform credential is -- and with the same
	// answer, because a distinct one would tell a caller which class the operation
	// would have accepted.
	t.Run("principal with no credential kind is 403", func(t *testing.T) {
		ctx := principal.ContextWithPrincipal(context.Background(), &principal.Principal{
			Kind: principal.KindUnset,
		})

		_, err := Organization(ctx)

		assertProblem(t, err, http.StatusForbidden,
			principal.ErrCodeWrongCredentialKind, principal.ErrMsgWrongCredentialKind)
	})
}

func TestPlatform(t *testing.T) {
	t.Run("carries the authenticating token and scopes, and no organization", func(t *testing.T) {
		platformTokenID := uuid.New()
		ctx := platformContext(platformTokenID, scope.Delete(scope.Organizations))

		c, err := Platform(ctx)

		require.NoError(t, err)
		assert.Equal(t, platformTokenID, c.PlatformTokenID())
		assert.Equal(t, []string{scope.Delete(scope.Organizations)}, c.Scopes())
	})

	t.Run("organization principal is 403", func(t *testing.T) {
		_, err := Platform(organizationContext(uuid.New(), uuid.New()))

		assertProblem(t, err, http.StatusForbidden,
			principal.ErrCodeWrongCredentialKind, principal.ErrMsgWrongCredentialKind)
	})

	t.Run("no principal is 401", func(t *testing.T) {
		_, err := Platform(context.Background())

		assertProblem(t, err, http.StatusUnauthorized, scope.ErrCodeNoIdentity, scope.ErrMsgNoIdentity)
	})

	// Both surfaces refuse it, so there is no door a system principal can be walked
	// through by picking the other constructor.
	t.Run("system principal is 403", func(t *testing.T) {
		_, err := Platform(systemContext())

		assertProblem(t, err, http.StatusForbidden,
			principal.ErrCodeWrongCredentialKind, principal.ErrMsgWrongCredentialKind)
	})
}

// Require replaced the huma scope middleware for every driver at once, so its
// answers are that middleware's answers -- same code, same message, same status.
// This pins the answer; kaitenhuma's authorization_error_test.go pins that a
// request gets it.
func TestRequire(t *testing.T) {
	required := scope.Write(scope.Customers)

	t.Run("granted scope passes", func(t *testing.T) {
		require.NoError(t, Static(uuid.New(), uuid.New(), []string{required}).Require(required))
		require.NoError(t, LocalPlatform([]string{required}).Require(required))
	})

	// Delegated to scope.HasScope rather than reimplemented, so the implication
	// rules stay in one place. This asserts the delegation, not the rules.
	t.Run("write implies read, as everywhere else", func(t *testing.T) {
		c := Static(uuid.New(), uuid.New(), []string{scope.Write(scope.Customers)})

		require.NoError(t, c.Require(scope.Read(scope.Customers)))
	})

	t.Run("missing scope is 403 naming the scope", func(t *testing.T) {
		err := Static(uuid.New(), uuid.New(), []string{scope.Read(scope.Customers)}).Require(required)

		assertProblem(t, err, http.StatusForbidden,
			scope.ErrCodeMissingScope, scope.MissingScopeMessage(required))
	})

	// The property that lets both types drop a "came from a constructor" flag: a
	// declared caller is granted nothing, because every field is unexported and the
	// zero value's scope set is empty. This is the whole of what such a flag caught.
	//
	// It answers missing-scope rather than no-identity, and that is not a wire
	// contract regressing. A zero value cannot reach this from a request -- the
	// constructors return an error instead of a caller, and
	// TestEveryRegisteredOperationResolvesItsCaller pins that every operation goes
	// through one -- so this is the answer to a programming mistake, and the mistake
	// is genuinely "this caller holds no scopes".
	t.Run("zero value is granted nothing", func(t *testing.T) {
		assertProblem(t, OrganizationCaller{}.Require(required),
			http.StatusForbidden, scope.ErrCodeMissingScope, scope.MissingScopeMessage(required))
		assertProblem(t, PlatformCaller{}.Require(required),
			http.StatusForbidden, scope.ErrCodeMissingScope, scope.MissingScopeMessage(required))
	})

	// A zero value must not be widenable into one, either: Scopes returns a clone,
	// so there is no slice a consumer can reach through to grant itself something.
	t.Run("zero value cannot be widened through Scopes", func(t *testing.T) {
		c := OrganizationCaller{}

		returned := c.Scopes()
		returned = append(returned, scope.WriteAll())

		require.Error(t, c.Require(required), "a zero caller acquired authority: %v", returned)
	})
}

// scopeRequirer is the shape the two credentialed classes share. Asserted here,
// not declared in the package, so nothing is tempted to accept "a caller, any
// caller" and lose the class distinction the types exist to carry.
type scopeRequirer interface{ Require(string) error }

var (
	_ scopeRequirer = OrganizationCaller{}
	_ scopeRequirer = PlatformCaller{}
)

func TestScopesCannotBeWidenedByAConsumer(t *testing.T) {
	granted := []string{scope.Read(scope.Customers)}
	c := Static(uuid.New(), uuid.New(), granted)

	returned := c.Scopes()
	returned[0] = scope.WriteAll()

	require.Error(t, c.Require(scope.Write(scope.Customers)),
		"mutating the slice Scopes returned must not grant the caller anything")
}

// admin-tools mints organization tokens with no parent today, which keeps them
// outside any platform-token cascade revocation. Routing it through the facade
// must not quietly give them one.
func TestLocalPlatformHasNoParentToken(t *testing.T) {
	assert.Equal(t, uuid.Nil, LocalPlatform(scope.AllScopes()).PlatformTokenID())
}

func organizationContext(userID, organizationID uuid.UUID, scopes ...string) context.Context {
	return principal.ContextWithPrincipal(context.Background(), &principal.Principal{
		Kind:           principal.KindOrganization,
		UserID:         userID,
		OrganizationID: organizationID,
		Scopes:         scopes,
	})
}

func platformContext(platformTokenID uuid.UUID, scopes ...string) context.Context {
	return principal.ContextWithPrincipal(context.Background(), &principal.Principal{
		Kind:            principal.KindPlatform,
		UserID:          uuid.New(),
		PlatformTokenID: platformTokenID,
		Scopes:          scopes,
	})
}

func systemContext() context.Context {
	return principal.ContextWithPrincipal(context.Background(), &principal.Principal{
		Kind:           principal.KindSystem,
		UserID:         uuid.New(),
		OrganizationID: uuid.New(),
	})
}

func assertProblem(t *testing.T, err error, status int, code, message string) {
	t.Helper()

	var apiErr *kaitenerrors.Error
	require.ErrorAs(t, err, &apiErr)
	assert.Equal(t, status, apiErr.HTTPStatus())
	assert.Equal(t, code, apiErr.ErrorCode())
	assert.Equal(t, message, apiErr.Message)
}

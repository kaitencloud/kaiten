package caller

import (
	"slices"

	"github.com/google/uuid"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// OrganizationCaller is a user or service account acting inside exactly one
// organization. The organization is not a parameter of the operations it
// invokes: it is this caller's own execution context, established by the
// credential itself.
//
// Every field is unexported and there is no setter, so the only value a package
// outside this one can write for itself is the zero value -- which carries no
// scopes, and is therefore refused by [OrganizationCaller.Require] like any other
// caller that was granted nothing. That is why there is no "did this come from a
// constructor" flag on this type: authority here is the scope set, a declared
// caller has an empty one, and a second field asserting the same refusal would
// only be a second thing to keep in sync.
type OrganizationCaller struct {
	userID         uuid.UUID
	organizationID uuid.UUID
	scopes         []string
}

// UserID is the acting user or service account.
func (c OrganizationCaller) UserID() uuid.UUID { return c.userID }

// OrganizationID is the organization this caller acts inside. Never uuid.Nil for
// a caller that came from a constructor.
func (c OrganizationCaller) OrganizationID() uuid.UUID { return c.organizationID }

// Scopes returns a copy, so a consumer cannot widen the authority of a caller it
// was handed.
func (c OrganizationCaller) Scopes() []string { return slices.Clone(c.scopes) }

// Require reports whether this caller may invoke an operation gated on required.
//
// The codes and messages are the ones the huma scope middleware emitted, so a
// response body did not change when the check moved out of the middleware chain
// and into the facade -- this is now the only place a scope refusal is decided, on
// any transport or none.
func (c OrganizationCaller) Require(required string) error {
	return requireScope(c.scopes, required)
}

// PlatformCaller authenticates system:kaiten. It has no organization, by
// construction and not by omission — see [OrganizationCaller] for the class that
// does, and for why a zero value needs no flag to be refused.
type PlatformCaller struct {
	platformTokenID uuid.UUID
	scopes          []string
}

// PlatformTokenID is the credential that authenticated the request, and what
// links a token minted during it back to its parent for cascade revocation.
//
// uuid.Nil for a caller from [LocalPlatform]: there was no token. A token minted
// under one therefore has no parent, which is the behaviour admin-tools has
// today and is deliberately outside any cascade.
func (c PlatformCaller) PlatformTokenID() uuid.UUID { return c.platformTokenID }

// Scopes returns a copy. See [OrganizationCaller.Scopes].
func (c PlatformCaller) Scopes() []string { return slices.Clone(c.scopes) }

// Require reports whether this caller may invoke an operation gated on required.
// See [OrganizationCaller.Require] for why these codes are not this package's own.
func (c PlatformCaller) Require(required string) error {
	return requireScope(c.scopes, required)
}

func requireScope(scopes []string, required string) error {
	if !scope.HasScope(scopes, required) {
		return kaitenerrors.Forbidden(scope.ErrCodeMissingScope, scope.MissingScopeMessage(required))
	}
	return nil
}

func errNoIdentity() error {
	return kaitenerrors.Unauthorized(scope.ErrCodeNoIdentity, scope.ErrMsgNoIdentity)
}

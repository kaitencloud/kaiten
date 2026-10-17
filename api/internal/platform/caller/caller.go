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

// PublishableKeyCaller is a vendor's web page, identified by its publishable
// key. It carries an organization and nothing to authorize with: no user, no
// scopes. What bounds it is the route family -- only the public catalogue asks
// for one -- so there is no Require method to forget to call.
type PublishableKeyCaller struct {
	organizationID uuid.UUID
	keyID          uuid.UUID
}

// OrganizationID is the organization whose catalogue the key reads.
func (c PublishableKeyCaller) OrganizationID() uuid.UUID { return c.organizationID }

// KeyID is the publishable key that authenticated the request.
func (c PublishableKeyCaller) KeyID() uuid.UUID { return c.keyID }

// CustomerSessionCaller is a vendor's customer, acting through a customer
// session the vendor's backend minted. Like PublishableKeyCaller it carries no
// scopes: what bounds it is the customer it is bound to -- every query a
// session route runs filters on it -- and, when bound, the instance.
type CustomerSessionCaller struct {
	organizationID uuid.UUID
	sessionID      uuid.UUID
	actorID        uuid.UUID
	customerID     uuid.UUID
	customerSlug   string
	instanceID     *uuid.UUID
	instanceSlug   *string
	allowedOrigins []string
}

// OrganizationID is the vendor's organization.
func (c CustomerSessionCaller) OrganizationID() uuid.UUID { return c.organizationID }

// SessionID is the session that authenticated the request.
func (c CustomerSessionCaller) SessionID() uuid.UUID { return c.sessionID }

// ActorID is the vendor principal that minted the session, which the writes
// the session makes are attributed to.
func (c CustomerSessionCaller) ActorID() uuid.UUID { return c.actorID }

// CustomerID and CustomerSlug are the customer the session acts for.
func (c CustomerSessionCaller) CustomerID() uuid.UUID { return c.customerID }
func (c CustomerSessionCaller) CustomerSlug() string  { return c.customerSlug }

// InstanceID and InstanceSlug are the instance the session is bound to; nil
// for a session that acts for the whole customer.
func (c CustomerSessionCaller) InstanceID() *uuid.UUID { return c.instanceID }
func (c CustomerSessionCaller) InstanceSlug() *string  { return c.instanceSlug }

// AllowedOrigins are the browser origins the session may be used from, which
// are also the only places a session route may send the browser back to.
func (c CustomerSessionCaller) AllowedOrigins() []string { return slices.Clone(c.allowedOrigins) }

package principal

import (
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

// Kind is the class of credential a request was authenticated with.
type Kind string

const (
	// KindUnset is the zero value: no credential class was established. No caller
	// constructor accepts it, which is the point -- see Kind's doc comment.
	KindUnset Kind = ""

	// KindOrganization authenticates a user or service account inside exactly one
	// organization, which is the credential's own execution context. Spelled the
	// same as db.TokenKindOrganization, the `token.kind` value behind it.
	KindOrganization Kind = "organization"

	// KindPlatform authenticates system:kaiten with no organization context. Only
	// obtainable from an HS256-verified platform JWT, and only usable on the
	// Platform API.
	KindPlatform Kind = "platform"

	// KindSystem authenticates Kaiten itself, acting inside one organization it was
	// told about rather than one a credential named. There is no credential, so
	// there are no scopes: what bounds it is that only internal/kaiten can build
	// one, and only for work the process is doing on its own behalf -- a CDC
	// delivery it is consuming, not a request somebody made.
	//
	// It carries a real actor. system:kaiten is a row in "user" with a membership
	// in every organization (see internal/platform/platformidentity and the
	// ensure_kaiten_system_user_membership_for_org trigger), and a system principal
	// is built from that row resolved for that organization -- never from a nil
	// UUID and never from the pinned constant alone. So an audit payload written on
	// this path names Kaiten <system@kaiten.sh>, and an organization whose
	// membership is gone stops the work instead of acting as a non-member.
	//
	// Neither caller constructor accepts it, which is what keeps it off both wires:
	// a system context that somehow reached a registered operation is refused with
	// ErrCodeWrongCredentialKind, exactly as a platform credential on the Core API
	// is. currentuser.GetUser does accept it, because it names an organization and
	// an actor, which is the whole question that provider answers.
	KindSystem Kind = "system"

	// KindPublishableKey authenticates a vendor's web page by its publishable key
	// (pk_), on the /api/public routes only. It names an organization and no
	// actor: UserID is uuid.Nil, there are no scopes, and JIT provisioning skips
	// it. What bounds it is that only caller.PublishableKey accepts it, and only
	// the public catalogue asks for that caller.
	KindPublishableKey Kind = "publishable_key"

	// KindCustomerSession authenticates a vendor's customer, through a session
	// (kst_) the vendor's backend minted, on the /api/public/session routes
	// only. UserID is the vendor principal that minted the session: Kaiten
	// cannot tell the vendor's end users apart, so the writes a session makes
	// are attributed to whoever vouched for it. It carries no scopes; what
	// bounds it is its customer (and instance, when bound), in CustomerSession,
	// and that only caller.CustomerSession accepts it.
	KindCustomerSession Kind = "customer_session"
)

// ErrCodeWrongCredentialKind and ErrMsgWrongCredentialKind are the single answer
// to every credential-class mismatch, in either direction and at whichever layer
// notices it -- caller.Organization and caller.Platform for everything that
// resolves one, which is every huma operation, the OFREP routes and the GraphQL
// handler; auth.PlatformMiddleware for a credential that is not a platform one
// arriving at the Platform listener.
//
// One code for all of them is not tidiness. The layers cover different sets of
// paths: a caller constructor runs inside a handler, so it is reached only for a
// path that routes, while the Platform listener's authenticator answers before
// routing. Distinct codes would therefore let a caller holding the wrong class of
// credential learn, path by path, which paths are registered operations -- an
// enumeration oracle handed out by the very mechanism meant to reveal nothing. The
// message is shared for the same reason.
//
// They live in this package rather than in any one enforcement point because every
// enforcement point already depends on it, and none should depend on another.
const (
	//nolint:gosec // G101 false positive: an error code and a user-facing message, not a credential
	ErrCodeWrongCredentialKind = "Auth.WrongCredentialKind"
	ErrMsgWrongCredentialKind  = "this operation does not accept the credential class used to authenticate"
)

// Principal represents the authenticated user identity extracted from auth token.
// Token carries the raw bearer credential, so it is never serialized -- the
// struct is mutated in place by JIT provisioning and would otherwise leak the
// credential the first time any call site marshals a Principal.
type Principal struct {
	Token string `json:"-"`
	// Kind is the credential class, and it is required: the zero value is
	// KindUnset, which no operation accepts.
	Kind   Kind      `json:"kind"`
	UserID uuid.UUID `json:"user_id"`
	// OrganizationID is uuid.Nil if and only if Kind is KindPlatform: an
	// organization credential's own execution context, and a system principal's
	// resolved one, are both real.
	OrganizationID uuid.UUID `json:"organization_id"`
	// PlatformTokenID is the credential that authenticated the request, set if
	// and only if Kind is KindPlatform. It arrives in the signed platform JWT, so
	// it is not client-controllable, and it is what links a minted organization
	// token back to its parent for cascade revocation and audit attribution.
	PlatformTokenID uuid.UUID `json:"-"`
	// CustomerSession is what a customer session is bound to, set if and only
	// if Kind is KindCustomerSession.
	CustomerSession *CustomerSession `json:"-"`
	// PublishableKeyID is the key that authenticated the request, set if and
	// only if Kind is KindPublishableKey.
	PublishableKeyID uuid.UUID    `json:"-"`
	Scopes           []string     `json:"scopes"`
	Provisioning     Provisioning `json:"-"`
}

// IsPlatform reports whether this is a platform credential. Nil-safe, because
// the middlewares that ask are also the ones that run before a principal is
// guaranteed to exist.
func (p *Principal) IsPlatform() bool { return p != nil && p.Kind == KindPlatform }

// Provisioning contains trusted identity metadata used by JIT provisioning.
type Provisioning struct {
	Subject                string
	Email                  string
	Name                   string
	OrganizationName       string
	ExternalOrganizationID string
}

// HasScope checks if the principal has the required scope.
// Delegates to scope.HasScope for centralized permission logic
func (p *Principal) HasScope(required string) bool {
	return scope.HasScope(p.Scopes, required)
}

// HasAllScopes checks if the principal has ALL the required scopes
// Delegates to scope.HasAllScopes for centralized permission logic
func (p *Principal) HasAllScopes(required []string) bool {
	return scope.HasAllScopes(p.Scopes, required)
}

// CustomerSession is the customer, and optionally the instance, a customer
// session acts for, and the browser origins it may be used from: the union of
// its organization's live publishable keys' allowed origins.
type CustomerSession struct {
	ID             uuid.UUID
	CustomerID     uuid.UUID
	CustomerSlug   string
	InstanceID     *uuid.UUID
	InstanceSlug   *string
	AllowedOrigins []string
}

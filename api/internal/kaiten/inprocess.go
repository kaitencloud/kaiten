package kaiten

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registerconnector"
	connectorschema "github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createplatformtoken"
	identityschema "github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensureorganization"
	organizationschema "github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/users"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/ensureuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/suggestusers"
)

// InProcess is the surface with no transport counterpart: operations that run
// before, beneath or outside any credential this deployment issued.
//
// The admission test is that a transport counterpart is *impossible* for this
// caller, not merely absent today:
//
//   - EnsureOrganization, EnsureUser: the caller is the authentication path
//     resolving the token, so there is no credential yet to authorize with.
//   - CreatePlatformToken: it mints the credential the Platform API
//     authenticates with; an API requiring one could never issue the first.
//   - ListOrganizations, ListPlatformTokens, SuggestUsers, RevokePlatformToken:
//     cross-tenant or cross-credential enumeration, which is what the Platform
//     API's invisibility rules exist to prevent.
//   - ResolveUser: a lookup keyed on a provider's subject is that same
//     cross-tenant question. Clients use pkg/externalid.DeriveUserID instead.
//   - RegisterConnector: a compiled-in connector registers while the process is
//     starting, before the server serves and possibly before the deployment is
//     bootstrapped, so the caller that would hold a credential cannot exist.
//
// EnsureOrganization and RegisterConnector are dual-published: a bootstrapper
// or an externally hosted connector holds a ksm_ and reaches the Platform
// method, where a scope IS checked. tests/architecture tests that pairing
// directly, and carries a floor on the number of methods here so that raising
// it is a diff a reviewer has to agree with.
//
// No method takes a caller, and nothing here checks a scope: there is no
// credential to carry one, and a check against an empty set would read like a
// control while being none. What bounds these operations is possession of the
// database connection string, plus the call-site allowlist in
// tests/architecture that says who may hold it and still reach this namespace.
type InProcess struct {
	connectors *connectors.UseCases
	identity   *identity.UseCases
	org        *organization.UseCases
	users      *users.UseCases
}

// InProcess returns the credential-free surface. A value, not a pointer, for the
// reason Platform is: four module pointers and no state of its own.
func (k *Kaiten) InProcess() InProcess {
	return InProcess{
		connectors: k.modules.Connectors,
		identity:   k.modules.Identity,
		org:        k.modules.Organization,
		users:      k.modules.Users,
	}
}

// RegisterConnector records a connector this binary ships, so the deployment knows it
// exists before anyone tries to use it.
//
// Idempotent by name: the use case upserts, so a restart converges on one row and a
// version bump updates it in place. That is what lets this be an unconditional step
// in startup rather than something the server has to remember whether it has done.
//
// See Platform.RegisterConnector for the credentialed half.
func (p InProcess) RegisterConnector(
	ctx context.Context, body registerconnector.RegisterConnectorBody,
) (*connectorschema.Connector, error) {
	return p.connectors.Register.Execute(bindInProcess(ctx), body)
}

// EnsureOrganization converges on the organization an external id names, creating
// it if this deployment has not seen it before.
func (p InProcess) EnsureOrganization(
	ctx context.Context, cmd *ensureorganization.Command,
) (*organizationschema.Organization, error) {
	return p.org.EnsureOrganization.Execute(bindInProcess(ctx), cmd)
}

// EnsureUser converges on the user an identity provider describes and on their
// membership in the organization they are authenticating into, and returns their
// internal id.
func (p InProcess) EnsureUser(ctx context.Context, cmd *ensureuser.Command) (uuid.UUID, error) {
	return p.users.EnsureUser.Execute(bindInProcess(ctx), cmd)
}

// ResolveUser returns the internal id of the user an identity provider's external id
// names, soft-deleted users included.
func (p InProcess) ResolveUser(ctx context.Context, externalID string) (uuid.UUID, error) {
	return p.users.ResolveUser.Execute(bindInProcess(ctx), externalID)
}

// SuggestUsers returns the live users whose external id starts with externalIDPrefix,
// bounded by the use case's own ceiling.
func (p InProcess) SuggestUsers(
	ctx context.Context, externalIDPrefix string,
) ([]suggestusers.Candidate, error) {
	return p.users.SuggestUsers.Execute(bindInProcess(ctx), externalIDPrefix)
}

// ListOrganizations returns every organization in the deployment.
func (p InProcess) ListOrganizations(ctx context.Context) ([]organizationschema.Organization, error) {
	return p.org.ListOrganizations.Execute(bindInProcess(ctx))
}

// CreatePlatformToken issues a platform credential, returning it with its
// plaintext -- the only moment that value exists.
//
// The command is not wrapped in a transaction here, and must not be, for the reason
// Platform.MintOrganizationToken states at length: the use case opens one per
// attempt inside its slug-collision retry, and uow.Transact joins an existing
// transaction rather than nesting, so an outer one would be poisoned by the first
// colliding attempt.
func (p InProcess) CreatePlatformToken(
	ctx context.Context, cmd *createplatformtoken.Command,
) (*identityschema.PlainPlatformToken, error) {
	return p.identity.CreatePlatformToken.Execute(bindInProcess(ctx), cmd)
}

// ListPlatformTokens returns every platform credential this deployment has issued,
// revoked and expired rows included.
func (p InProcess) ListPlatformTokens(ctx context.Context) ([]identityschema.PlatformToken, error) {
	return p.identity.ListPlatformTokens.Execute(bindInProcess(ctx))
}

// RevokePlatformToken retires the platform credential named name along with every
// organization credential it issued, and returns how many credentials were retired
// in total. Subtracting one gives the number of tenant credentials that stopped
// working.
//
// Addressed by name rather than by id or slug because that is what an operator has:
// they created it by name, and names are unique among active platform credentials.
func (p InProcess) RevokePlatformToken(ctx context.Context, name string) (int, error) {
	return p.identity.RevokePlatformToken.Execute(bindInProcess(ctx), name)
}

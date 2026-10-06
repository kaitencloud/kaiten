package kaiten

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closebillingperiods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registerconnector"
	connectorschema "github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/getplatformcredential"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/listorganizationtokens"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/mintorganizationtoken"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/revokeorganizationtoken"
	identityschema "github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/deletemembership"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/deleteorganization"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensureorganization"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/getorganization"
	organizationschema "github.com/kaitencloud/kaiten/api/internal/modules/organization/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/users"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/deleteuser"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/platform/targetorg"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Platform is the Platform API's ten operations: everything system:kaiten can
// do while holding a credential that names no organization.
//
// It spans five modules, which is why it is a namespace of its own rather than a
// method set on each. What these ten have in common is the credential class, not
// the table they touch -- and the credential class is the thing a caller has to get
// right. A driver reaching for one of these has a ksm_ token, or it has no business
// here.
type Platform struct {
	billing    *billing.UseCases
	connectors *connectors.UseCases
	identity   *identity.UseCases
	org        *organization.UseCases
	users      *users.UseCases
}

// Platform returns the platform surface. A value, not a pointer: it holds four
// module pointers and no state of its own, so copying it is copying four words.
func (k *Kaiten) Platform() Platform {
	return Platform{
		billing:    k.modules.Billing,
		connectors: k.modules.Connectors,
		identity:   k.modules.Identity,
		org:        k.modules.Organization,
		users:      k.modules.Users,
	}
}

// GetCredential describes the credential presented, and nothing else. There is no
// argument to name a different one -- see getplatformcredential.Request.
func (p Platform) GetCredential(ctx context.Context, cl caller.PlatformCaller) (identityschema.PlatformCredential, error) {
	if err := cl.Require(getplatformcredential.RequiredScope); err != nil {
		return identityschema.PlatformCredential{}, err
	}

	return p.identity.GetPlatformCredential.Execute(bindPlatform(ctx, cl))
}

// DeleteUser soft-deletes a user platform-wide. No target organization: a user is
// global, which is exactly why a credential with no organization execution context
// is the right thing to authorize this.
func (p Platform) DeleteUser(ctx context.Context, cl caller.PlatformCaller, userID uuid.UUID) error {
	if err := cl.Require(deleteuser.RequiredScope); err != nil {
		return err
	}

	return p.users.DeleteUser.Execute(bindPlatform(ctx, cl), userID)
}

func (p Platform) GetOrganization(
	ctx context.Context, cl caller.PlatformCaller, target uuid.UUID,
) (*organizationschema.Organization, error) {
	ctx, err := p.bindTarget(ctx, cl, getorganization.RequiredScope, target)
	if err != nil {
		return nil, err
	}

	return p.org.GetOrganization.Execute(ctx, target)
}

// EnsureOrganization converges on an organization named by its provider id,
// creating it if it is not already there.
//
// The only platform operation on an organization that does not go through
// bindTarget, and the only one that cannot: bindTarget refuses a target that does
// not exist, and this is the operation that makes one exist. So it authorizes on
// the scope alone -- which is the whole check here, because the row it converges on
// is identified by the caller's own argument rather than found by it. There is no
// tenant to leak the existence of: a caller holding write:organizations may create
// this organization, and creating one that was already there is the same request
// with a different outcome.
//
// It emits no event and opens no transaction; see the use case's package comment
// for both.
func (p Platform) EnsureOrganization(
	ctx context.Context, cl caller.PlatformCaller, cmd *ensureorganization.Command,
) (*organizationschema.Organization, error) {
	if err := cl.Require(ensureorganization.RequiredScope); err != nil {
		return nil, err
	}

	return p.org.EnsureOrganization.Execute(bindPlatform(ctx, cl), cmd)
}

func (p Platform) DeleteOrganization(ctx context.Context, cl caller.PlatformCaller, target uuid.UUID) error {
	ctx, err := p.bindTarget(ctx, cl, deleteorganization.RequiredScope, target)
	if err != nil {
		return err
	}

	return p.org.DeleteOrganization.Execute(ctx, target)
}

// RegisterConnector records that this deployment knows a connector exists, and what
// settings it takes.
//
// Platform rather than organization-scoped because of what it writes: the registry is
// one row per connector for the whole deployment. It takes no target organization for
// the same reason -- there is no tenant this acts inside, so bindTarget would have
// nothing to bind and forcing a default one would make the catalogue look like
// somebody's.
//
// It is also published on InProcess, and the pairing is deliberate: a connector built
// into this binary registers at startup, before any credential exists to present. The
// domain logic is the same use case either way, so the two paths cannot drift about
// what a registration means -- only about who is allowed to ask.
func (p Platform) RegisterConnector(
	ctx context.Context, cl caller.PlatformCaller, body registerconnector.RegisterConnectorBody,
) (*connectorschema.Connector, error) {
	if err := cl.Require(registerconnector.RequiredScope); err != nil {
		return nil, err
	}

	return p.connectors.Register.Execute(bindPlatform(ctx, cl), body)
}

func (p Platform) DeleteMembership(
	ctx context.Context, cl caller.PlatformCaller, target, userID uuid.UUID,
) error {
	ctx, err := p.bindTarget(ctx, cl, deletemembership.RequiredScope, target)
	if err != nil {
		return err
	}

	return p.org.DeleteMembership.Execute(ctx, target, userID)
}

// MintOrganizationToken issues an ordinary organization credential for
// system:kaiten inside target.
//
// The command is not wrapped in a transaction here, and must not be: the use case
// opens one per attempt inside its slug-collision retry, and uow.Transact joins an
// existing transaction rather than nesting -- so an outer one would be poisoned by
// the first colliding attempt and every retry would fail on the aborted
// transaction instead of on the fresh slug.
func (p Platform) MintOrganizationToken(
	ctx context.Context, cl caller.PlatformCaller, target uuid.UUID, cmd *mintorganizationtoken.Command,
) (*identityschema.PlainToken, error) {
	ctx, err := p.bindTarget(ctx, cl, mintorganizationtoken.RequiredScope, target)
	if err != nil {
		return nil, err
	}

	return p.identity.MintOrganizationToken.Execute(ctx, cmd)
}

// ListOrganizationTokens names the still-active credentials this platform
// credential minted inside target, so one can be addressed for revocation --
// RevokeOrganizationToken takes a slug, and a slug is server-generated.
func (p Platform) ListOrganizationTokens(
	ctx context.Context, cl caller.PlatformCaller, target uuid.UUID,
) ([]identityschema.Token, error) {
	ctx, err := p.bindTarget(ctx, cl, listorganizationtokens.RequiredScope, target)
	if err != nil {
		return nil, err
	}

	return p.identity.ListOrganizationTokens.Execute(ctx)
}

func (p Platform) RevokeOrganizationToken(
	ctx context.Context, cl caller.PlatformCaller, target uuid.UUID, tokenSlug string,
) error {
	ctx, err := p.bindTarget(ctx, cl, revokeorganizationtoken.RequiredScope, target)
	if err != nil {
		return err
	}

	return p.identity.RevokeOrganizationToken.Execute(ctx, tokenSlug)
}

// CloseBillingPeriods closes target's due subscriptions now, on behalf of the
// platform: what operations and the nightly sandbox run instead of waiting for
// the period-close job.
func (p Platform) CloseBillingPeriods(
	ctx context.Context, cl caller.PlatformCaller, target uuid.UUID, instanceSlug *string,
) (*closing.Report, error) {
	ctx, err := p.bindTarget(ctx, cl, closebillingperiods.RequiredScope, target)
	if err != nil {
		return nil, err
	}

	return p.billing.CloseBillingPeriods.ExecuteFor(ctx, target, instanceSlug)
}

// bindTarget authorizes a platform call that acts inside one named organization,
// and returns the context its use case runs under.
func (p Platform) bindTarget(
	ctx context.Context, cl caller.PlatformCaller, required string, target uuid.UUID,
) (context.Context, error) {
	if err := cl.Require(required); err != nil {
		return nil, err
	}

	if target == uuid.Nil {
		return nil, kaitenerrors.Validation(
			targetorg.ErrCodeInvalid,
			"the target organization id is not a valid identifier",
		)
	}

	exists, err := p.org.TargetOrganization.OrganizationExists(ctx, target)
	if err != nil {
		// Never flattened into the 404 below: "we could not tell" and "it does not
		// exist" are different answers, and only one of them is safe for a caller
		// to conclude anything from.
		return nil, kaitenerrors.Wrap(
			err, kaitenerrors.KindInternal,
			targetorg.ErrCodeUnavailable,
			"the target organization could not be resolved",
		)
	}
	if !exists {
		return nil, kaitenerrors.NotFound(
			targetorg.ErrCodeNotFound,
			"the target organization does not exist",
		)
	}

	// The target goes in its own context slot, never into the principal: see
	// package targetorg. The principal that lands beside it still has
	// OrganizationID == uuid.Nil, which is what keeps "act on X" from becoming
	// "act as a member of X".
	return targetorg.ContextWithTarget(bindPlatform(ctx, cl), target), nil
}

package kaiten

import (
	"context"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createtokenonserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/deletetokenonserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/getserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/getserviceaccounts"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/getserviceaccounttokens"
	identityschema "github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/updateserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// ServiceAccounts is the seven identity operations a tenant reaches with its own
// credential: four on the machine user, three on the tokens it authenticates with.
//
// Named for the aggregate rather than the module, unlike every other namespace here,
// because identity is the one module whose operations are split by credential class,
// and no one of those parts is the module. Its platform-facing three live on
// Platform, its credential-bootstrap three on InProcess, and what remains on the
// Core document is this: service accounts, and their tokens. A namespace called
// Identity would claim all fourteen and deliver seven.
//
// One operation of the module is on no surface at all -- validatetoken, the ext_authz
// check Envoy calls. It authenticates rather than acts: there is no caller to take,
// because producing one is what it is for. It stays a use case the server registers
// directly, and it is the only such exception in the tree.
//
// See Customers for the naming and argument-order convention.
type ServiceAccounts struct {
	uc *identity.UseCases
}

// ServiceAccounts returns the service accounts surface.
func (k *Kaiten) ServiceAccounts() ServiceAccounts {
	return ServiceAccounts{uc: k.modules.Identity}
}

// Create makes a machine user. slug is optional: nil means "derive one from the
// name", which is the same contract every other slug-bearing create has.
func (s ServiceAccounts) Create(
	ctx context.Context, cl caller.OrganizationCaller, name string, slug *string,
) (*identityschema.ServiceAccount, error) {
	if err := cl.Require(createserviceaccount.RequiredScope); err != nil {
		return nil, err
	}

	return s.uc.CreateServiceAccount.Execute(bindOrganization(ctx, cl), name, slug)
}

func (s ServiceAccounts) List(
	ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
) (pagination.Page[*identityschema.ServiceAccount], error) {
	if err := cl.Require(getserviceaccounts.RequiredScope); err != nil {
		return pagination.Page[*identityschema.ServiceAccount]{}, err
	}

	return s.uc.GetServiceAccounts.Execute(bindOrganization(ctx, cl), limit, cursor)
}

func (s ServiceAccounts) Get(
	ctx context.Context, cl caller.OrganizationCaller, slug string,
) (*identityschema.ServiceAccount, error) {
	if err := cl.Require(getserviceaccount.RequiredScope); err != nil {
		return nil, err
	}

	return s.uc.GetServiceAccount.Execute(bindOrganization(ctx, cl), slug)
}

// Update writes the name and nothing else. The slug identifies the account and is
// not rewritable, which is why this takes both and not a command.
func (s ServiceAccounts) Update(
	ctx context.Context, cl caller.OrganizationCaller, slug, name string,
) error {
	if err := cl.Require(updateserviceaccount.RequiredScope); err != nil {
		return err
	}

	return s.uc.UpdateServiceAccount.Execute(bindOrganization(ctx, cl), slug, name)
}

// CreateToken mints a token on a service account and returns it in plain text, the
// once. Nothing can read the secret again afterwards -- see identityschema.PlainToken.
func (s ServiceAccounts) CreateToken(
	ctx context.Context, cl caller.OrganizationCaller,
	serviceAccountSlug, name string, slug *string, scopes []string, expiresAt *time.Time,
) (*identityschema.PlainToken, error) {
	if err := cl.Require(createtokenonserviceaccount.RequiredScope); err != nil {
		return nil, err
	}

	return s.uc.CreateTokenOnServiceAccount.Execute(
		bindOrganization(ctx, cl), serviceAccountSlug, name, slug, scopes, expiresAt)
}

func (s ServiceAccounts) ListTokens(
	ctx context.Context, cl caller.OrganizationCaller,
	serviceAccountSlug string, limit int32, cursor *string,
) (pagination.Page[identityschema.Token], error) {
	if err := cl.Require(getserviceaccounttokens.RequiredScope); err != nil {
		return pagination.Page[identityschema.Token]{}, err
	}

	return s.uc.GetServiceAccountTokens.Execute(
		bindOrganization(ctx, cl), serviceAccountSlug, limit, cursor)
}

// DeleteToken revokes a token. The row stays, revoked, so an audit of what was
// issued survives the revocation -- which is why the method is not called Revoke on
// a surface where Delete means the same thing everywhere else.
func (s ServiceAccounts) DeleteToken(
	ctx context.Context, cl caller.OrganizationCaller, serviceAccountSlug, tokenSlug string,
) error {
	if err := cl.Require(deletetokenonserviceaccount.RequiredScope); err != nil {
		return err
	}

	return s.uc.DeleteTokenOnServiceAccount.Execute(
		bindOrganization(ctx, cl), serviceAccountSlug, tokenSlug)
}

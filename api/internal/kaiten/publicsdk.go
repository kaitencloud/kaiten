package kaiten

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/authenticatepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createpublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/listpublishablekeys"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/revokepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/updatepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// PublicSDK is the public SDK surface's operations: managing the publishable
// keys, which an organization credential does, and reading the public
// catalogue, which a publishable key does.
//
// See Customers for the naming and argument-order convention.
type PublicSDK struct {
	uc *publicsdk.UseCases
}

// PublicSDK returns the public SDK surface.
func (k *Kaiten) PublicSDK() PublicSDK {
	return PublicSDK{uc: k.modules.PublicSDK}
}

func (p PublicSDK) CreatePublishableKey(ctx context.Context, cl caller.OrganizationCaller, draft createpublishablekey.PublishableKeyDraft) (*keys.PublishableKeyCreated, error) {
	if err := cl.Require(createpublishablekey.RequiredScope); err != nil {
		return nil, err
	}
	return p.uc.CreatePublishableKey.Execute(bindOrganization(ctx, cl), draft)
}

func (p PublicSDK) ListPublishableKeys(ctx context.Context, cl caller.OrganizationCaller, includeRevoked bool) ([]keys.PublishableKey, error) {
	if err := cl.Require(listpublishablekeys.RequiredScope); err != nil {
		return nil, err
	}
	return p.uc.ListPublishableKeys.Execute(bindOrganization(ctx, cl), includeRevoked)
}

func (p PublicSDK) UpdatePublishableKey(ctx context.Context, cl caller.OrganizationCaller, keyID uuid.UUID, patch updatepublishablekey.PublishableKeyPatch) (*keys.PublishableKey, error) {
	if err := cl.Require(updatepublishablekey.RequiredScope); err != nil {
		return nil, err
	}
	return p.uc.UpdatePublishableKey.Execute(bindOrganization(ctx, cl), keyID, patch)
}

func (p PublicSDK) RevokePublishableKey(ctx context.Context, cl caller.OrganizationCaller, keyID uuid.UUID) (*keys.PublishableKey, error) {
	if err := cl.Require(revokepublishablekey.RequiredScope); err != nil {
		return nil, err
	}
	return p.uc.RevokePublishableKey.Execute(bindOrganization(ctx, cl), keyID)
}

// GetPublicCatalog takes a publishable key caller, which has no scope to
// require: the key authorizes this read by being one. The organization is the
// key's, passed explicitly -- there is no user to bind.
func (p PublicSDK) GetPublicCatalog(ctx context.Context, cl caller.PublishableKeyCaller, query getpubliccatalog.Query) (*getpubliccatalog.PublicCatalog, error) {
	return p.uc.GetPublicCatalog.Execute(ctx, cl.OrganizationID(), query)
}

// PublishableKeyAuthenticator is what auth.PublishableKeyMiddleware resolves
// keys with. Outside the facade's caller convention for the reason identity's
// ValidateToken is: it runs before there is a caller to take.
func (k *Kaiten) PublishableKeyAuthenticator() *authenticatepublishablekey.UseCase {
	return k.modules.PublicSDK.AuthenticatePublishableKey
}

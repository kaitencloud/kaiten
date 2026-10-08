package kaiten

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/completepaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createportalsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/authenticatecustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/authenticatepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/completesessionpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createpublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessioncheckout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessionpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessionportalsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/getpubliccatalog"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/listpublishablekeys"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/listsessioninvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/revokecustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/revokepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/updatepublishablekey"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
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

// PublishableKeyAuthenticator is what auth.PublicMiddleware resolves keys
// with. Outside the facade's caller convention for the reason identity's
// ValidateToken is: it runs before there is a caller to take.
func (k *Kaiten) PublishableKeyAuthenticator() *authenticatepublishablekey.UseCase {
	return k.modules.PublicSDK.AuthenticatePublishableKey
}

// CustomerSessionAuthenticator is what auth.PublicMiddleware resolves
// customer sessions with, for the same reason.
func (k *Kaiten) CustomerSessionAuthenticator() *authenticatecustomersession.UseCase {
	return k.modules.PublicSDK.AuthenticateCustomerSession
}

func (p PublicSDK) CreateCustomerSession(ctx context.Context, cl caller.OrganizationCaller, draft createcustomersession.CustomerSessionDraft) (*createcustomersession.CreatedCustomerSession, error) {
	if err := cl.Require(createcustomersession.RequiredScope); err != nil {
		return nil, err
	}
	return p.uc.CreateCustomerSession.Execute(bindOrganization(ctx, cl), draft)
}

func (p PublicSDK) RevokeCustomerSession(ctx context.Context, cl caller.OrganizationCaller, sessionID uuid.UUID) error {
	if err := cl.Require(revokecustomersession.RequiredScope); err != nil {
		return err
	}
	return p.uc.RevokeCustomerSession.Execute(bindOrganization(ctx, cl), sessionID)
}

// CreateSessionPaymentMethodSession, CompleteSessionPaymentMethodSession and
// CreateSessionPortalSession act on the session's customer, from the caller,
// never from the request; return URLs are held to the session's origins.
func (p PublicSDK) CreateSessionPaymentMethodSession(ctx context.Context, cl caller.CustomerSessionCaller,
	request createsessionpaymentmethodsession.NewSessionPaymentMethodSession,
) (*createpaymentmethodsession.PaymentMethodSession, error) {
	return p.uc.CreateSessionPaymentMethodSession.Execute(bindCustomerSession(ctx, cl), createsessionpaymentmethodsession.Session{
		CustomerSlug: cl.CustomerSlug(), AllowedOrigins: cl.AllowedOrigins(),
	}, request)
}

func (p PublicSDK) CompleteSessionPaymentMethodSession(ctx context.Context, cl caller.CustomerSessionCaller,
	setupSessionID string,
) (*completepaymentmethodsession.CompletedPaymentMethodSession, error) {
	return p.uc.CompleteSessionPaymentMethodSession.Execute(bindCustomerSession(ctx, cl), completesessionpaymentmethodsession.Session{
		CustomerSlug: cl.CustomerSlug(),
	}, setupSessionID)
}

func (p PublicSDK) CreateSessionPortalSession(ctx context.Context, cl caller.CustomerSessionCaller,
	request createsessionportalsession.NewSessionPortalSession,
) (*createportalsession.PortalSession, error) {
	return p.uc.CreateSessionPortalSession.Execute(bindCustomerSession(ctx, cl), createsessionportalsession.Session{
		CustomerSlug: cl.CustomerSlug(), AllowedOrigins: cl.AllowedOrigins(),
	}, request)
}

// CreateSessionCheckout and ListSessionInvoices take a customer session caller,
// which has no scope to require: what bounds it is the customer and instance
// it is bound to, which the facade hands to the use case from the caller --
// never from the request.
func (p PublicSDK) CreateSessionCheckout(ctx context.Context, cl caller.CustomerSessionCaller, request createsessioncheckout.SessionCheckoutOrder) (*createsessioncheckout.SessionCheckout, error) {
	return p.uc.CreateSessionCheckout.Execute(bindCustomerSession(ctx, cl), createsessioncheckout.Session{
		CustomerSlug: cl.CustomerSlug(), InstanceSlug: cl.InstanceSlug(), AllowedOrigins: cl.AllowedOrigins(),
	}, request)
}

func (p PublicSDK) ListSessionInvoices(ctx context.Context, cl caller.CustomerSessionCaller, cursor string, limit int32) (pagination.Page[sessions.SessionInvoice], error) {
	return p.uc.ListSessionInvoices.Execute(bindCustomerSession(ctx, cl), listsessioninvoices.Session{
		CustomerID: cl.CustomerID(), InstanceID: cl.InstanceID(),
	}, cursor, limit)
}

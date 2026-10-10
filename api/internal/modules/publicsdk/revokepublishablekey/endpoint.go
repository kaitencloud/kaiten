package revokepublishablekey

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Revoker is the one facade method this operation calls.
type Revoker interface {
	RevokePublishableKey(ctx context.Context, cl caller.OrganizationCaller, keyID uuid.UUID) (*keys.PublishableKey, error)
}

type Request struct {
	KeyID uuid.UUID `path:"keyId" doc:"Publishable key id"`
}

type Response struct {
	Body *keys.PublishableKey
}

func RegisterEndpoint(api huma.API, app Revoker) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "revokePublishableKey",
		Method:      http.MethodPost,
		Path:        "/publishable-keys/{keyId}/revoke",
		Summary:     "Revoke a publishable key",
		Description: "The key stops authenticating on the next request. Idempotent; revocation is final.",
		Tags:        []string{"publishable-keys"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		revoked, err := app.RevokePublishableKey(ctx, cl, request.KeyID)
		if err != nil {
			return nil, err
		}
		return &Response{Body: revoked}, nil
	})
}

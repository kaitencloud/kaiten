package updatepublishablekey

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Updater is the one facade method this operation calls.
type Updater interface {
	UpdatePublishableKey(ctx context.Context, cl caller.OrganizationCaller, keyID uuid.UUID, patch PublishableKeyPatch) (*keys.PublishableKey, error)
}

type Request struct {
	KeyID uuid.UUID `path:"keyId" doc:"Publishable key id"`
	Body  PublishableKeyPatch
}

type Response struct {
	Body *keys.PublishableKey
}

func RegisterEndpoint(api huma.API, app Updater) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "updatePublishableKey",
		Method:      http.MethodPatch,
		Path:        "/publishable-keys/{keyId}",
		Summary:     "Update a publishable key",
		Description: "Changes a live key's label or allowed origins. A revoked key answers 409.",
		Tags:        []string{"publishable-keys"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		updated, err := app.UpdatePublishableKey(ctx, cl, request.KeyID, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: updated}, nil
	})
}

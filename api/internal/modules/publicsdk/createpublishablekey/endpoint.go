package createpublishablekey

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Creator is the one facade method this operation calls.
type Creator interface {
	CreatePublishableKey(ctx context.Context, cl caller.OrganizationCaller, draft PublishableKeyDraft) (*keys.PublishableKeyCreated, error)
}

type Request struct {
	Body PublishableKeyDraft
}

type Response struct {
	Body *keys.PublishableKeyCreated
}

func RegisterEndpoint(api huma.API, app Creator) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID:   "createPublishableKey",
		Method:        http.MethodPost,
		Path:          "/publishable-keys",
		Summary:       "Create a publishable key",
		Description:   "Issues a pk_ key for a web page to read the organization's public catalogue (GET /api/public/catalog) and nothing else. The key is returned once; only its digest is stored.",
		Tags:          []string{"publishable-keys"},
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		created, err := app.CreatePublishableKey(ctx, cl, request.Body)
		if err != nil {
			return nil, err
		}
		return &Response{Body: created}, nil
	})
}

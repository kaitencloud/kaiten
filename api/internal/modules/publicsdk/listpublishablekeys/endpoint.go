package listpublishablekeys

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListPublishableKeys(ctx context.Context, cl caller.OrganizationCaller, includeRevoked bool, cursor string, limit int32) (pagination.Page[keys.PublishableKey], error)
}

type Request struct {
	IncludeRevoked bool   `query:"includeRevoked" doc:"Also list revoked keys"`
	Cursor         string `query:"cursor" doc:"Opaque pagination cursor from a previous response's nextCursor"`
	Limit          int32  `query:"limit" minimum:"1" maximum:"200" doc:"Maximum number of entries to return (default 50, max 200)"`
}

type Response struct {
	Body pagination.Page[keys.PublishableKey]
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listPublishableKeys",
		Method:      http.MethodGet,
		Path:        "/publishable-keys",
		Summary:     "List publishable keys",
		Description: "The organization's publishable keys, newest first. The keys themselves are never returned, only their last four characters.",
		Tags:        []string{"publishable-keys"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		items, err := app.ListPublishableKeys(ctx, cl, request.IncludeRevoked, request.Cursor, request.Limit)
		if err != nil {
			return nil, err
		}
		return &Response{Body: items}, nil
	})
}

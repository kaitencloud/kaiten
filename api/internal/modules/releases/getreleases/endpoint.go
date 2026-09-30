package getreleases

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Lister is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Lister interface {
	List(
		ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
	) (pagination.Page[*schema.Release], error)
}

type Request struct {
	Cursor string `query:"cursor" doc:"Opaque pagination cursor from a previous response's nextCursor"`
	Limit  int32  `query:"limit" doc:"Maximum number of entries to return (default 50, max 200)" minimum:"1" maximum:"200"`
}

type Response struct {
	Body pagination.Page[*schema.Release]
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "list-releases",
		Method:      http.MethodGet,
		Path:        "/releases",
		Summary:     "List releases",
		Description: "Returns a cursor-paginated page of releases for the current organization.",
		Tags:        []string{"releases"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		var cursor *string
		if request.Cursor != "" {
			cursor = &request.Cursor
		}
		page, err := app.List(ctx, cl, request.Limit, cursor)
		if err != nil {
			return nil, err
		}
		return &Response{
			Body: page,
		}, nil
	})
}

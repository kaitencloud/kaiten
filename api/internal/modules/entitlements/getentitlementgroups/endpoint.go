package getentitlementgroups

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Lister is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Lister interface {
	ListGroups(
		ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
	) (pagination.Page[*schema.EntitlementGroup], error)
}

// Request represents the HTTP request query parameters for listing
// entitlement groups.
type Request struct {
	Cursor string `query:"cursor" doc:"Opaque pagination cursor from a previous response's nextCursor"`
	Limit  int32  `query:"limit" doc:"Maximum number of entries to return (default 50, max 200)" minimum:"1" maximum:"200"`
}

// Response represents the HTTP response body for listing entitlement groups.
type Response struct {
	Body pagination.Page[*schema.EntitlementGroup]
}

// RegisterEndpoint registers the HTTP endpoint for listing entitlement groups.
func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "list-entitlement-groups",
		Method:      http.MethodGet,
		Path:        "/entitlement-groups",
		Summary:     "List all entitlement groups",
		Description: "Returns a cursor-paginated page of entitlement groups for the current organization.",
		Tags:        []string{"entitlement-groups"},
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
		page, err := app.ListGroups(ctx, cl, request.Limit, cursor)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: page,
		}, nil
	})
}

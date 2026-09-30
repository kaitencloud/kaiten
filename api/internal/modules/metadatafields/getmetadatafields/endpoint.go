package getmetadatafields

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Lister is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Lister interface {
	List(
		ctx context.Context, cl caller.OrganizationCaller,
		cmd *Command, limit int32, cursor *string,
	) (pagination.Page[*schema.MetadataField], error)
}

type Request struct {
	ResourceType db.MetadataFieldResourceType `query:"resourceType" required:"true" enum:"DEPLOYMENT_ZONE,INSTANCE"`
	Cursor       string                       `query:"cursor" doc:"Opaque pagination cursor from a previous response's nextCursor"`
	Limit        int32                        `query:"limit" doc:"Maximum number of entries to return (default 50, max 200)" minimum:"1" maximum:"200"`
}

type Response struct {
	Body pagination.Page[*schema.MetadataField]
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "list-metadata-fields",
		Method:      http.MethodGet,
		Path:        "/metadata-fields",
		Summary:     "List active metadata fields for a resource type",
		Description: "Returns a cursor-paginated page of the active (non-archived) metadata fields declared for the org and the given resource type, ordered by displayOrder then createdAt.",
		Tags:        []string{"metadataFields"},
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
		page, err := app.List(
			ctx, cl, &Command{ResourceType: request.ResourceType}, request.Limit, cursor)
		if err != nil {
			return nil, err
		}
		return &Response{Body: page}, nil
	})
}

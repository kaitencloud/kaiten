package listlicensefamilies

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// FamilyLister is the one facade method this operation calls. Declared here rather
// than imported: internal/kaiten holds this use case, so naming it would close a
// cycle.
type FamilyLister interface {
	ListFamilies(
		ctx context.Context, cl caller.OrganizationCaller, limit int32, cursor *string,
	) (pagination.Page[*schema.LicenseFamilyView], error)
}

type Request struct {
	Cursor string `query:"cursor" doc:"Opaque pagination cursor from a previous response's nextCursor"`
	Limit  int32  `query:"limit" doc:"Maximum number of entries to return (default 50, max 200)" minimum:"1" maximum:"200"`
}

type Response struct {
	Body pagination.Page[*schema.LicenseFamilyView]
}

// RegisterEndpoint declares GET /license-families.
//
// Families get a top-level path, as entitlement groups do, rather than
// /licenses/families: there, "families" would also be a valid {licenseSlug}, and
// the router answers with the first registered route that matches, with no
// preference for a literal segment.
func RegisterEndpoint(api huma.API, app FamilyLister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "list-license-families",
		Method:      http.MethodGet,
		Path:        "/license-families",
		Summary:     "List license families",
		Description: "Returns a cursor-paginated page of license families for the current organization, each with the version it currently resolves to: the family's default version, or its highest-numbered published version. A family whose versions are all drafts or all archived is still listed, with no current version.",
		Tags:        []string{"license-families"},
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

		page, err := app.ListFamilies(ctx, cl, request.Limit, cursor)
		if err != nil {
			return nil, err
		}

		return &Response{
			Body: page,
		}, nil
	})
}

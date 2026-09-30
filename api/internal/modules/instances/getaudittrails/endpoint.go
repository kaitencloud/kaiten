package getaudittrails

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Lister is the one facade method this operation calls. Declared here rather than
// imported: internal/kaiten holds this use case, so naming it would close a cycle.
type Lister interface {
	ListAuditTrails(
		ctx context.Context, cl caller.OrganizationCaller,
		instanceSlug string, eventName, after, before *string, limit int32, cursor *string,
	) (pagination.Page[*schema.AuditTrail], error)
}

type Request struct {
	InstanceSlug string `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	EventName    string `query:"event_name" doc:"Filter by exact event name (e.g. ENTITLEMENT_VALUE_GET)"`
	After        string `query:"after" doc:"RFC3339 timestamp — include entries with timestamp ≥ this value"`
	Before       string `query:"before" doc:"RFC3339 timestamp — include entries with timestamp ≤ this value"`
	Limit        int32  `query:"limit" doc:"Maximum number of entries to return (default 50, max 200)" minimum:"1" maximum:"200"`
	Cursor       string `query:"cursor" doc:"Opaque pagination cursor from a previous response's nextCursor"`
}

type Response struct {
	Body pagination.Page[*schema.AuditTrail]
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "getAuditTrails",
		Method:      "GET",
		Path:        "/instances/{instanceSlug}/audit-trails",
		Summary:     "List audit trail entries for an instance",
		Description: "Returns audit trail events for a given instance, optionally filtered by event name and time range. Results are cursor-paginated (default limit: 50, max: 200) — pass the previous response's nextCursor as the cursor parameter to fetch the next page.",
		Tags:        []string{"instances"},
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}

		var eventName, after, before, cursor *string
		if request.EventName != "" {
			eventName = &request.EventName
		}
		if request.After != "" {
			after = &request.After
		}
		if request.Before != "" {
			before = &request.Before
		}
		if request.Cursor != "" {
			cursor = &request.Cursor
		}
		page, err := app.ListAuditTrails(
			ctx, cl, request.InstanceSlug, eventName, after, before, request.Limit, cursor)
		if err != nil {
			return nil, err
		}
		return &Response{Body: page}, nil
	})
}

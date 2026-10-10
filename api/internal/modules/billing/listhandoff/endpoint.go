package listhandoff

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListHandoff(ctx context.Context, cl caller.OrganizationCaller, status, cursor string, limit int32) (pagination.Page[QueuedInvoice], error)
}

type Request struct {
	Status string `query:"status" enum:"PENDING,ACKNOWLEDGED" doc:"PENDING (the default) or ACKNOWLEDGED; .InvalidStatus otherwise"`
	Cursor string `query:"cursor" doc:"Opaque cursor from the previous page's nextCursor"`
	Limit  int32  `query:"limit" minimum:"0" maximum:"200" doc:"Page size, 50 by default, 200 at most"`
}

type Response struct {
	Body pagination.Page[QueuedInvoice]
}

func RegisterEndpoint(api huma.API, app Lister) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listHandoff",
		Method:      http.MethodGet,
		Path:        "/billing/handoff",
		Summary:     "List the handoff queue",
		Description: "The invoices waiting for the organization's accounting system (PENDING), or already acknowledged by it, oldest issue first. Reading never leases: claim to take invoices. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Metadata:    kaitenhuma.SchemaCodes(map[string]string{"query.status": "ListHandoff.InvalidStatus"}),
		Errors:      []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*Response, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		page, err := app.ListHandoff(ctx, cl, request.Status, request.Cursor, request.Limit)
		if err != nil {
			return nil, err
		}
		return &Response{Body: page}, nil
	})
}

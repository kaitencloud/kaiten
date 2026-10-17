package exportorganizationusagereports

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usagehistory"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Exporter is the one facade method this operation calls. Declared here rather
// than imported: internal/kaiten holds this use case, so naming it would close a
// cycle.
type Exporter interface {
	ExportOrganizationUsageReports(
		ctx context.Context, cl caller.OrganizationCaller, q Query,
	) (*usagehistory.Export, error)
}

type Request struct {
	From time.Time `query:"from" doc:"Start of the range, inclusive (RFC 3339). Defaults to 30 days before to, moved up to the start of the organization's usage history when that is later. An explicit from before it answers 422 ExportUsageReports.OutsideRetention."`
	To   time.Time `query:"to" doc:"End of the range, exclusive (RFC 3339). Defaults to now. At most 31 days after from."`
	// Format is checked by the handler rather than as an enum, so that an
	// unknown one answers the documented ExportUsageReports.InvalidFormat.
	Format          string `query:"format" doc:"csv (the default): RFC 4180 with a header row. json: NDJSON, one report per line. Anything else answers 422 ExportUsageReports.InvalidFormat." example:"csv"`
	InstanceSlug    string `query:"instanceSlug" doc:"Only this instance's reports"`
	InstanceID      string `query:"instanceId" doc:"Only this instance's reports. Reaches a deleted instance, whose reports are kept." format:"uuid"`
	EntitlementSlug string `query:"entitlementSlug" doc:"Only this entitlement's reports"`
	EntitlementID   string `query:"entitlementId" doc:"Only this entitlement's reports. Reaches a deleted entitlement, whose reports are kept." format:"uuid"`
}

func RegisterEndpoint(api huma.API, app Exporter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "exportOrganizationUsageReports",
		Method:      http.MethodGet,
		Path:        "/usage/reports/export",
		Summary:     "Export the organization's usage reports",
		Description: "Streams every usage report of the organization in the range, across instances and entitlements, as CSV or NDJSON, ordered by reportedAt. Filters narrow it to one instance or one entitlement, including deleted ones by ID. Use it to keep the usage history before deleting the organization.",
		Tags:        []string{"instances"},
		Responses:   usagehistory.ExportResponses(),
		Errors: []int{
			http.StatusBadRequest,
			http.StatusUnauthorized,
			http.StatusForbidden,
			http.StatusNotFound,
			http.StatusUnprocessableEntity,
			http.StatusInternalServerError,
		},
	}, RequiredScope, func(ctx context.Context, request *Request) (*huma.StreamResponse, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		format, err := usagehistory.ParseFormat(operation, request.Format)
		if err != nil {
			return nil, err
		}

		q := Query{Format: format, InstanceSlug: request.InstanceSlug, EntitlementSlug: request.EntitlementSlug}
		if !request.From.IsZero() {
			q.From = &request.From
		}
		if !request.To.IsZero() {
			q.To = &request.To
		}
		// format:"uuid" has huma refuse a malformed ID before this runs; the
		// parse only guards against that ever changing.
		if q.InstanceID, err = parseID(request.InstanceID, "instanceId"); err != nil {
			return nil, err
		}
		if q.EntitlementID, err = parseID(request.EntitlementID, "entitlementId"); err != nil {
			return nil, err
		}

		export, err := app.ExportOrganizationUsageReports(ctx, cl, q)
		if err != nil {
			return nil, err
		}
		return usagehistory.StreamResponse(export), nil
	})
}

func parseID(value, name string) (*uuid.UUID, error) {
	if value == "" {
		return nil, nil
	}
	id, err := uuid.Parse(value)
	if err != nil {
		return nil, huma.Error422UnprocessableEntity(name + " must be a UUID")
	}
	return &id, nil
}

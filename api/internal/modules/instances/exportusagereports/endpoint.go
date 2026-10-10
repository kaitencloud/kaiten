package exportusagereports

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usagehistory"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Exporter is the one facade method this operation calls. Declared here rather
// than imported: internal/kaiten holds this use case, so naming it would close a
// cycle.
type Exporter interface {
	ExportUsageReports(
		ctx context.Context, cl caller.OrganizationCaller,
		instanceSlug, entitlementSlug string, q Query,
	) (*usagehistory.Export, error)
}

type Request struct {
	InstanceSlug    string    `path:"instanceSlug" doc:"Instance slug" example:"instance-slug"`
	EntitlementSlug string    `path:"entitlementSlug" doc:"Entitlement slug" example:"entitlement-slug"`
	From            time.Time `query:"from" doc:"Start of the range, inclusive (RFC 3339). Defaults to 30 days before to, moved up to the start of the organization's usage history when that is later. An explicit from before it answers 422 ExportUsageReports.OutsideRetention."`
	To              time.Time `query:"to" doc:"End of the range, exclusive (RFC 3339). Defaults to now. At most 366 days after from."`
	// Format is checked by the handler rather than as an enum, so that an
	// unknown one answers the documented ExportUsageReports.InvalidFormat.
	Format string `query:"format" doc:"csv (the default): RFC 4180 with a header row. json: NDJSON, one report per line, in the shape listUsageReports returns. Anything else answers 422 ExportUsageReports.InvalidFormat." example:"csv"`
}

func RegisterEndpoint(api huma.API, app Exporter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "exportUsageReports",
		Method:      http.MethodGet,
		Path:        "/instances/{instanceSlug}/entitlements/{entitlementSlug}/usage/reports/export",
		Summary:     "Export an entitlement's usage reports for an instance",
		Description: "Streams every report of one instance and entitlement in the range as CSV or NDJSON, in reportSeq order. Decimals are written exactly as the journal stores them.",
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
		format, err := usagehistory.ParseFormat("ExportUsageReports", request.Format)
		if err != nil {
			return nil, err
		}

		q := Query{Format: format}
		if !request.From.IsZero() {
			q.From = &request.From
		}
		if !request.To.IsZero() {
			q.To = &request.To
		}

		export, err := app.ExportUsageReports(ctx, cl, request.InstanceSlug, request.EntitlementSlug, q)
		if err != nil {
			return nil, err
		}
		return usagehistory.StreamResponse(export), nil
	})
}

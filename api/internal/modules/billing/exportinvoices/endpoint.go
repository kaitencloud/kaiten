package exportinvoices

import (
	"context"
	"io"
	"log/slog"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoicelist"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Exporter is the one facade method this operation calls.
type Exporter interface {
	ExportInvoices(ctx context.Context, cl caller.OrganizationCaller, params invoicelist.Params, instanceSlug, format, granularity string) (*Export, error)
}

type Request struct {
	invoicelist.Params
	InstanceSlug string `query:"instanceSlug" doc:"Only this instance's invoices"`
	// Format and Granularity are checked by the handler rather than as enums,
	// so an unknown one answers its documented code.
	Format      string `query:"format" doc:"csv (the default): RFC 4180 with a header row. json: NDJSON, one invoice with its lines per line. Anything else answers 422 ExportInvoices.InvalidFormat." example:"csv"`
	Granularity string `query:"granularity" doc:"For csv: line (the default), one row per invoice line with the invoice's columns repeated; invoice, one row per invoice. Anything else answers 422 ExportInvoices.InvalidGranularity." example:"line"`
}

func RegisterEndpoint(api huma.API, app Exporter) {
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "exportInvoices",
		Method:      http.MethodGet,
		Path:        "/invoices/export",
		Summary:     "Export invoices",
		Description: "Streams the invoices the filters of listInvoices select, as CSV or NDJSON. Amounts are integer minor units with the currency's exponent beside them, so a spreadsheet never sees a float. The export carries billing e-mails: it is an authenticated read for the organization's accounting. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Responses: map[string]*huma.Response{
			"200": {
				Description: "The invoices, as an attachment",
				Headers: map[string]*huma.Param{
					"Content-Disposition": {Description: "attachment, with a file name", Schema: &huma.Schema{Type: "string"}},
				},
				Content: map[string]*huma.MediaType{
					"text/csv":             {Schema: &huma.Schema{Type: "string"}},
					"application/x-ndjson": {Schema: &huma.Schema{Type: "string"}},
				},
			},
		},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*huma.StreamResponse, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		export, err := app.ExportInvoices(ctx, cl, request.Params, request.InstanceSlug, request.Format, request.Granularity)
		if err != nil {
			return nil, err
		}
		return stream(export), nil
	})
}

// stream sends the export as an attachment through the transport's stream
// writer, on a context detached from the request's cancellation: the writer
// runs after the handler returned.
func stream(export *Export) *huma.StreamResponse {
	return &huma.StreamResponse{Body: func(hctx huma.Context) {
		hctx.SetHeader("Content-Type", export.ContentType())
		hctx.SetHeader("Content-Disposition", `attachment; filename="`+export.Filename+`"`)
		hctx.SetStatus(http.StatusOK)
		ctx := context.WithoutCancel(hctx.Context())
		write := func(w io.Writer) {
			if err := export.Write(ctx, w); err != nil {
				slog.ErrorContext(ctx, "invoice export ended early; the client received a truncated file",
					"filename", export.Filename, "error", err)
			}
		}
		if streamer, ok := hctx.(interface{ StreamBody(func(io.Writer)) }); ok {
			streamer.StreamBody(write)
			return
		}
		write(hctx.BodyWriter())
	}}
}

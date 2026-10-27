package listinvoicelinereports

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"reflect"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	kaitenhuma "github.com/kaitencloud/kaiten/api/internal/infrastructure/http/huma"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Lister is the one facade method this operation calls.
type Lister interface {
	ListInvoiceLineReports(ctx context.Context, cl caller.OrganizationCaller, invoiceID, lineID uuid.UUID, q Query) (*Answer, error)
}

type Request struct {
	InvoiceID uuid.UUID `path:"invoiceId" doc:"Invoice identifier"`
	LineID    uuid.UUID `path:"lineId" doc:"Line identifier, as the invoice's lines carry it"`
	AfterSeq  int64     `query:"afterSeq" minimum:"0" doc:"Reports after this reportSeq; 0 starts at the first"`
	Limit     int32     `query:"limit" minimum:"0" maximum:"500" doc:"Page size, 100 by default, 500 at most"`
	Format    string    `query:"format" doc:"json (the default): one page. csv: every report, streamed as RFC 4180 with a header row. Anything else answers 422 ListInvoiceLineReports.InvalidFormat." example:"json"`
}

func RegisterEndpoint(api huma.API, app Lister) {
	pageSchema := api.OpenAPI().Components.Schemas.Schema(reflect.TypeOf(LineReportPage{}), true, "")
	kaitenhuma.RegisterScoped(api, huma.Operation{
		OperationID: "listInvoiceLineReports",
		Method:      http.MethodGet,
		Path:        "/invoices/{invoiceId}/lines/{lineId}/reports",
		Summary:     "List the usage reports behind an invoice line",
		Description: "The usage reports a USAGE or OVERAGE line was measured from: its pair's reports dated in its service period, in reportSeq order. Summed by reset window and floored at 0, they give the line's measured quantity. Addressed by invoice, it answers after the instance was deleted. Requires billing to be enabled for the organization.",
		Tags:        []string{"billing"},
		Responses: map[string]*huma.Response{
			"200": {
				Description: "One page of reports (json), or every report as a CSV attachment (csv)",
				Content: map[string]*huma.MediaType{
					"application/json": {Schema: pageSchema},
					"text/csv":         {Schema: &huma.Schema{Type: "string"}},
				},
			},
		},
		Errors: []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity, http.StatusInternalServerError, http.StatusServiceUnavailable},
	}, RequiredScope, func(ctx context.Context, request *Request) (*huma.StreamResponse, error) {
		cl, err := caller.Organization(ctx)
		if err != nil {
			return nil, err
		}
		if request.Format != "" && request.Format != "json" && request.Format != "csv" {
			return nil, kaitenerrors.UnprocessableEntity("ListInvoiceLineReports.InvalidFormat", "format is json or csv")
		}
		answer, err := app.ListInvoiceLineReports(ctx, cl, request.InvoiceID, request.LineID, Query{
			AfterSeq: request.AfterSeq, Limit: request.Limit, Format: request.Format,
		})
		if err != nil {
			return nil, err
		}
		return &huma.StreamResponse{Body: func(hctx huma.Context) {
			if answer.Page != nil {
				hctx.SetHeader("Content-Type", "application/json")
				hctx.SetStatus(http.StatusOK)
				if err := json.NewEncoder(hctx.BodyWriter()).Encode(answer.Page); err != nil {
					slog.ErrorContext(hctx.Context(), "could not write a line's usage reports", "error", err)
				}
				return
			}
			export := answer.Export
			hctx.SetHeader("Content-Type", export.ContentType())
			hctx.SetHeader("Content-Disposition", `attachment; filename="`+export.Filename+`"`)
			hctx.SetStatus(http.StatusOK)
			streamCtx := context.WithoutCancel(hctx.Context())
			write := func(w io.Writer) {
				if err := export.Write(streamCtx, w); err != nil {
					slog.ErrorContext(streamCtx, "line report export ended early; the client received a truncated file", "error", err)
				}
			}
			if streamer, ok := hctx.(interface{ StreamBody(func(io.Writer)) }); ok {
				streamer.StreamBody(write)
				return
			}
			write(hctx.BodyWriter())
		}}, nil
	})
}

package usagehistory

import (
	"context"
	"io"
	"log/slog"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
)

// StreamResponse sends export as an attachment.
//
// The body goes through the transport's stream writer when it has one, as
// Fiber's does: its plain body writer buffers the whole response in memory
// before sending a byte, which a year of reports would not survive. The
// stream writer runs after the handler has returned, so the export reads on a
// context detached from the request's cancellation: a client that goes away
// ends it at the next write instead.
func StreamResponse(export *Export) *huma.StreamResponse {
	return &huma.StreamResponse{Body: func(hctx huma.Context) {
		hctx.SetHeader("Content-Type", export.ContentType())
		hctx.SetHeader("Content-Disposition", `attachment; filename="`+export.Filename+`"`)
		hctx.SetStatus(http.StatusOK)

		ctx := context.WithoutCancel(hctx.Context())
		write := func(w io.Writer) {
			if err := export.Write(ctx, w); err != nil {
				slog.ErrorContext(ctx, "usage export ended early; the client received a truncated file",
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

// ExportResponses documents an export's 200: CSV or NDJSON, by format.
func ExportResponses() map[string]*huma.Response {
	return map[string]*huma.Response{
		"200": {
			Description: "The reports, as an attachment: CSV with a header row for format=csv, one JSON object per line for format=json",
			Headers: map[string]*huma.Param{
				"Content-Disposition": {Description: "attachment, with a file name naming the range", Schema: &huma.Schema{Type: "string"}},
			},
			Content: map[string]*huma.MediaType{
				"text/csv":             {Schema: &huma.Schema{Type: "string"}},
				"application/x-ndjson": {Schema: &huma.Schema{Type: "string"}},
			},
		},
	}
}

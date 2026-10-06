package usagehistory

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Format is an export's encoding.
type Format string

const (
	FormatCSV  Format = "csv"
	FormatJSON Format = "json"
)

const (
	// exportPageSize is the rows one export query reads: one statement, one
	// flush.
	exportPageSize = 5000
	// pageWriteTimeout is how long one page may take to reach the client. It
	// is renewed every page, so the length of an export is bounded by its
	// range rather than by the server's response timeout.
	pageWriteTimeout = time.Minute

	timeLayout = "2006-01-02T15:04:05.000Z07:00"
)

// csvHeader is the CSV export's columns, in order.
var csvHeader = []string{
	"organization_id", "instance_id", "entitlement_id", "report_seq", "reported_at",
	"behavior", "aggregation_method", "reported_value", "value_before", "value_after",
	"delta", "overage_delta", "event_count_after", "window_start", "window_end",
	"limit_value", "overage_percent", "license_id", "transaction_id", "properties",
}

// ParseFormat reads the format query parameter; "" is csv.
func ParseFormat(operation, value string) (Format, error) {
	switch Format(value) {
	case "", FormatCSV:
		return FormatCSV, nil
	case FormatJSON:
		return FormatJSON, nil
	default:
		return "", apierrors.UnprocessableEntity(operation+".InvalidFormat", "format must be one of: csv, json")
	}
}

// Export is an export ready to stream: the request is checked and the range
// resolved, and nothing is read until Write.
type Export struct {
	Format   Format
	Filename string
	next     func(ctx context.Context) ([]UsageReport, bool, error)
}

// NewPairExport exports one pair's reports in q.Range, in report_seq order.
func NewPairExport(reader *Reader, q PairQuery, format Format, name string) *Export {
	return &Export{
		Format:   format,
		Filename: filename(name, q.Range, format),
		next: func(ctx context.Context) ([]UsageReport, bool, error) {
			page, more, err := reader.ListPair(ctx, q, exportPageSize)
			if len(page) > 0 {
				q.AfterSeq = page[len(page)-1].ReportSeq
			}
			return page, more, err
		},
	}
}

// NewOrganizationExport exports an organization's reports in q.Range, in
// (reported_at, instance, entitlement, report_seq) order.
func NewOrganizationExport(reader *Reader, q OrganizationQuery, format Format, name string) *Export {
	after := startOf(q.Range)
	return &Export{
		Format:   format,
		Filename: filename(name, q.Range, format),
		next: func(ctx context.Context) ([]UsageReport, bool, error) {
			page, more, err := reader.listOrganization(ctx, q, after, exportPageSize)
			if len(page) > 0 {
				last := page[len(page)-1]
				after = organizationCursor{last.ReportedAt, last.InstanceID, last.EntitlementID, last.ReportSeq}
			}
			return page, more, err
		},
	}
}

// ContentType is the response's media type.
func (e *Export) ContentType() string {
	if e.Format == FormatJSON {
		return "application/x-ndjson"
	}
	return "text/csv; charset=utf-8"
}

// Write streams the whole export to w, page by page. When w can, each page
// renews its write deadline and is flushed before the next is read.
//
// An error after the first page reaches the client as a truncated body: the
// status line is long gone. It is returned for the caller to log.
func (e *Export) Write(ctx context.Context, w io.Writer) error {
	enc := newEncoder(e.Format, w)
	if err := enc.header(); err != nil {
		return err
	}
	for {
		page, more, err := e.next(ctx)
		if err != nil {
			return err
		}
		if d, ok := w.(interface{ SetWriteDeadline(time.Time) error }); ok {
			_ = d.SetWriteDeadline(time.Now().Add(pageWriteTimeout))
		}
		for i := range page {
			if err := enc.row(&page[i]); err != nil {
				return err
			}
		}
		if err := enc.flush(); err != nil {
			return err
		}
		if f, ok := w.(interface{ Flush() }); ok {
			f.Flush()
		}
		if !more {
			return nil
		}
	}
}

type encoder interface {
	header() error
	row(r *UsageReport) error
	flush() error
}

func newEncoder(format Format, w io.Writer) encoder {
	if format == FormatJSON {
		enc := json.NewEncoder(w)
		enc.SetEscapeHTML(false)
		return ndjsonEncoder{enc: enc}
	}
	return &csvEncoder{w: csv.NewWriter(w)}
}

// ndjsonEncoder writes one UsageReport per line, as the list returns it.
type ndjsonEncoder struct{ enc *json.Encoder }

func (ndjsonEncoder) header() error              { return nil }
func (e ndjsonEncoder) row(r *UsageReport) error { return e.enc.Encode(r) }
func (ndjsonEncoder) flush() error               { return nil }

// csvEncoder writes RFC 4180 CSV, LF-terminated, with csvHeader's columns.
type csvEncoder struct {
	w      *csv.Writer
	record [20]string
}

func (e *csvEncoder) header() error { return e.w.Write(csvHeader) }

func (e *csvEncoder) row(r *UsageReport) error {
	e.record = [20]string{
		r.organizationID.String(), r.InstanceID.String(), r.EntitlementID.String(),
		strconv.FormatInt(r.ReportSeq, 10), r.ReportedAt.Format(timeLayout),
		r.Behavior, r.AggregationMethod, r.ReportedValue, r.ValueBefore, r.ValueAfter,
		r.Delta, r.OverageDelta, strconv.FormatInt(int64(r.EventCountAfter), 10),
		formatTime(r.WindowStart), formatTime(r.WindowEnd),
		deref(r.LimitValue), formatPercent(r.OveragePercent), r.LicenseID.String(),
		textCell(deref(r.TransactionID)), textCell(compactJSON(r.Properties)),
	}
	return e.w.Write(e.record[:])
}

func (e *csvEncoder) flush() error {
	e.w.Flush()
	return e.w.Error()
}

// textCell keeps a free-text cell from being read as a formula by a
// spreadsheet: one starting with =, +, -, @, a tab or a carriage return gets a
// leading apostrophe. Numeric columns are never prefixed.
func textCell(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

func compactJSON(properties map[string]any) string {
	if properties == nil {
		return ""
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(properties); err != nil {
		return ""
	}
	return strings.TrimSuffix(buf.String(), "\n")
}

func formatTime(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format(timeLayout)
}

func formatPercent(p *int16) string {
	if p == nil {
		return ""
	}
	return strconv.Itoa(int(*p))
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// filename names the download: name, then the range's UTC days.
func filename(name string, r Range, format Format) string {
	extension := "csv"
	if format == FormatJSON {
		extension = "ndjson"
	}
	return fmt.Sprintf("%s-%s-%s.%s", name, r.From.UTC().Format("20060102"), r.To.UTC().Format("20060102"), extension)
}

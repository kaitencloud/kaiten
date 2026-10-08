package exportinvoices

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoicelist"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
)

// Formats and granularities, as the query spells them.
const (
	FormatCSV  = "csv"
	FormatJSON = "json"

	GranularityLine    = "line"
	GranularityInvoice = "invoice"

	exportPageSize   = 500
	pageWriteTimeout = time.Minute
	timeLayout       = "2006-01-02T15:04:05.000Z07:00"
)

var invoiceColumns = []string{
	"invoice_id", "kind", "boundary_at", "status", "provider_kind", "customer_slug", "customer_name",
	"instance_slug", "license_slug", "billing_email", "currency", "currency_exponent", "issued_at", "due_at",
	"service_from", "service_to",
}

var lineColumns = []string{
	"line_seq", "line_type", "line_label", "line_description", "quantity", "unit_amount_decimal",
	"line_amount_minor", "line_service_from", "line_service_to", "entitlement_slug", "voucher_id",
}

var totalColumns = []string{"subtotal_minor", "discount_total_minor", "total_minor", "external_reference", "handoff_status"}

// Export is an export ready to stream: the request is checked, nothing is
// read until Write.
type Export struct {
	Format      string
	Granularity string
	Filename    string
	each        func(ctx context.Context, fn func([]db.InstanceInvoice) error) error
}

// New exports the invoices the filters select.
func New(q *db.Queries, organizationID uuid.UUID, params invoicelist.Params, instanceSlug string, now, autoCollectionBefore time.Time, format, granularity string) *Export {
	return &Export{
		Format:      format,
		Granularity: granularity,
		Filename:    "invoices-" + now.Format("20060102T150405Z") + "." + extension(format),
		each: func(ctx context.Context, fn func([]db.InstanceInvoice) error) error {
			return invoicelist.Each(ctx, q, organizationID, params, instanceSlug, now, autoCollectionBefore, exportPageSize, fn)
		},
	}
}

func extension(format string) string {
	if format == FormatJSON {
		return "ndjson"
	}
	return "csv"
}

// ContentType is the response's media type.
func (e *Export) ContentType() string {
	if e.Format == FormatJSON {
		return "application/x-ndjson"
	}
	return "text/csv; charset=utf-8"
}

// Write streams the export to w, a page at a time. An error after the first
// page reaches the client as a truncated body; it is returned for the caller
// to log.
func (e *Export) Write(ctx context.Context, w io.Writer) error {
	var enc encoder
	if e.Format == FormatJSON {
		j := json.NewEncoder(w)
		j.SetEscapeHTML(false)
		enc = &ndjsonEncoder{enc: j}
	} else {
		enc = &csvEncoder{w: csv.NewWriter(w), lines: e.Granularity == GranularityLine}
	}
	if err := enc.header(); err != nil {
		return err
	}
	err := e.each(ctx, func(rows []db.InstanceInvoice) error {
		if d, ok := w.(interface{ SetWriteDeadline(time.Time) error }); ok {
			_ = d.SetWriteDeadline(time.Now().Add(pageWriteTimeout))
		}
		for _, row := range rows {
			invoice, err := invoices.FromRow(row)
			if err != nil {
				return err
			}
			if err := enc.invoice(invoice); err != nil {
				return err
			}
		}
		if err := enc.flush(); err != nil {
			return err
		}
		if f, ok := w.(interface{ Flush() }); ok {
			f.Flush()
		}
		return nil
	})
	if err != nil {
		return err
	}
	return enc.flush()
}

type encoder interface {
	header() error
	invoice(invoices.Invoice) error
	flush() error
}

// ndjsonEncoder writes one invoice per line, with its lines.
type ndjsonEncoder struct{ enc *json.Encoder }

func (*ndjsonEncoder) header() error                      { return nil }
func (e *ndjsonEncoder) invoice(i invoices.Invoice) error { return e.enc.Encode(i) }
func (*ndjsonEncoder) flush() error                       { return nil }

// csvEncoder writes RFC 4180 CSV: one row per line, or one per invoice. The
// invoice's columns repeat on each of its lines' rows. Amounts stay integer
// minor units, with the currency's exponent beside them.
type csvEncoder struct {
	w     *csv.Writer
	lines bool
}

func (e *csvEncoder) header() error {
	columns := append([]string{}, invoiceColumns...)
	if e.lines {
		columns = append(columns, lineColumns...)
	}
	return e.w.Write(append(columns, totalColumns...))
}

func (e *csvEncoder) invoice(i invoices.Invoice) error {
	head := []string{
		i.ID.String(), i.Kind, i.BoundaryAt.Format(timeLayout), i.Status, i.ProviderKind,
		textCell(i.CustomerSlug), textCell(i.CustomerName), textCell(i.InstanceSlug), textCell(i.LicenseSlug),
		textCell(deref(i.BillingEmail)), i.Currency, strconv.Itoa(int(money.Currency(i.Currency).Exponent())),
		formatTime(i.IssuedAt), formatTime(i.DueAt), i.ServiceFrom.Format(timeLayout), i.ServiceTo.Format(timeLayout),
	}
	tail := []string{
		strconv.FormatInt(i.Subtotal, 10), strconv.FormatInt(i.DiscountTotal, 10), strconv.FormatInt(i.Total, 10),
		textCell(deref(i.Handoff.ExternalReference)), i.HandoffStatus,
	}
	if !e.lines {
		return e.w.Write(append(head, tail...))
	}
	if len(i.Lines) == 0 {
		return e.w.Write(append(append(head, make([]string, len(lineColumns))...), tail...))
	}
	for _, line := range i.Lines {
		if err := e.w.Write(append(append(append([]string{}, head...), lineCells(line)...), tail...)); err != nil {
			return err
		}
	}
	return nil
}

func lineCells(line rating.InvoiceLine) []string {
	return []string{
		strconv.Itoa(line.Seq), string(line.Type), textCell(line.Label), textCell(line.Description), line.Quantity,
		line.UnitAmountDecimal, strconv.FormatInt(line.Amount, 10), line.ServiceFrom.Format(timeLayout),
		line.ServiceTo.Format(timeLayout), textCell(deref(line.EntitlementSlug)), "",
	}
}

func (e *csvEncoder) flush() error {
	e.w.Flush()
	return e.w.Error()
}

// textCell keeps a free-text cell from being read as a formula by a
// spreadsheet.
func textCell(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

func formatTime(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format(timeLayout)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

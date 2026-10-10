package listinvoicelinereports

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usagehistory"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	operation    = "ListInvoiceLineReports"
	DefaultLimit = 100
	MaxLimit     = 500
)

// LineReportPage is one page of the usage reports behind an invoice line.
type LineReportPage struct {
	Items        []usagehistory.UsageReport `json:"items" nullable:"false" doc:"The reports, in reportSeq order"`
	NextAfterSeq *int64                     `json:"nextAfterSeq,omitempty" doc:"Pass as afterSeq to read the next page. Absent on the last page."`
}

// Query is what to read of a line's reports.
type Query struct {
	AfterSeq int64
	Limit    int32
	Format   string
}

// Answer is a page, or an export to stream.
type Answer struct {
	Page   *LineReportPage
	Export *usagehistory.Export
}

type UseCase struct {
	deps access.Deps
}

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads the usage reports a metered line was measured from: its pair's
// reports dated in its service period. Summed by window and floored, they give
// the line's measured quantity. Addressed by invoice, it answers after the
// instance was deleted: the reports outlive it.
func (u *UseCase) Execute(ctx context.Context, invoiceID, lineID uuid.UUID, q Query) (*Answer, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	notFound := kaitenerrors.NotFoundf(operation+".LineNotFound", "invoice %s has no line %s", invoiceID, lineID)
	dbq := u.deps.Queries(ctx)
	row, err := dbq.GetInvoice(ctx, db.GetInvoiceParams{OrganizationID: user.OrganizationID, ID: invoiceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, kaitenerrors.NotFoundf(operation+".NotFound", "invoice %s not found", invoiceID)
	}
	if err != nil {
		return nil, err
	}
	invoice, err := invoices.FromRow(row)
	if err != nil {
		return nil, err
	}
	var line *rating.InvoiceLine
	for i := range invoice.Lines {
		if invoice.Lines[i].ID != nil && *invoice.Lines[i].ID == lineID {
			line = &invoice.Lines[i]
		}
	}
	if line == nil {
		return nil, notFound
	}
	if line.EntitlementID == nil || line.Metering == nil {
		return nil, kaitenerrors.UnprocessableEntity(operation+".NotMetered", "only a USAGE or OVERAGE line has usage reports")
	}
	instanceID, err := u.instanceOf(ctx, dbq, row, line)
	if err != nil {
		return nil, err
	}

	clock, err := dbq.BillingClock(ctx)
	if err != nil {
		return nil, err
	}
	if start := u.deps.Usage.RetentionStart(ctx, user.OrganizationID, clock.Time.UTC()); start != nil && line.ServiceFrom.Before(*start) {
		// errors[0] stays the line's metering (§6.5 rule 7); retentionStart
		// follows, as every OutsideRetention names it.
		return nil, kaitenerrors.UnprocessableEntityWithErrors(operation+".OutsideRetention",
			"the line's period starts before the organization's usage history: its reports are gone, its metering remains",
			&kaitenerrors.ErrorDetail{Message: "the line's metering", Location: "metering", Value: line.Metering},
			&kaitenerrors.ErrorDetail{Message: "retentionStart", Location: "retentionStart", Value: start.UTC().Format(time.RFC3339Nano)})
	}

	ref := ports.UsageRef{OrganizationID: user.OrganizationID, InstanceID: instanceID, EntitlementID: *line.EntitlementID}
	if q.Format == string(usagehistory.FormatCSV) {
		name := "invoice-" + invoiceID.String() + "-line-" + lineID.String()
		return &Answer{Page: nil, Export: u.deps.Usage.ExportReports(ref, line.ServiceFrom, line.ServiceTo, usagehistory.FormatCSV, name)}, nil
	}
	limit := q.Limit
	if limit <= 0 {
		limit = DefaultLimit
	}
	if limit > MaxLimit {
		limit = MaxLimit
	}
	items, more, err := u.deps.Usage.ListReports(ctx, ref, line.ServiceFrom, line.ServiceTo, q.AfterSeq, limit)
	if err != nil {
		return nil, err
	}
	page := &LineReportPage{Items: items, NextAfterSeq: nil}
	if page.Items == nil {
		page.Items = []usagehistory.UsageReport{}
	}
	if more && len(items) > 0 {
		next := items[len(items)-1].ReportSeq
		page.NextAfterSeq = &next
	}
	return &Answer{Page: page, Export: nil}, nil
}

// instanceOf is the instance whose reports a line was measured from: as the
// line's fingerprint names it, else the subscription's.
func (u *UseCase) instanceOf(ctx context.Context, q *db.Queries, row db.InstanceInvoice, line *rating.InvoiceLine) (uuid.UUID, error) {
	if line.Metering.Ledger != nil && line.Metering.Ledger.InstanceID != nil {
		return *line.Metering.Ledger.InstanceID, nil
	}
	sub, err := q.GetSubscriptionByID(ctx, row.InstanceBillingID)
	if err != nil {
		return uuid.Nil, err
	}
	if sub.InstanceID == nil {
		return uuid.Nil, kaitenerrors.UnprocessableEntity(operation+".NotMetered", "the line names no instance to read reports of")
	}
	return *sub.InstanceID, nil
}

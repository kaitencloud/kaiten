package usagehistory

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Reader reads one organization's journal through its two keyset queries.
// Every page is one statement on its own: no transaction stays open across
// pages, so a long export never pins a snapshot or holds back vacuum.
type Reader struct {
	queries *db.Queries
}

func NewReader(conn db.DBTX) *Reader {
	return &Reader{queries: db.New(conn)}
}

// PairQuery selects one pair's reports in a range.
type PairQuery struct {
	OrganizationID, InstanceID, EntitlementID uuid.UUID
	Range                                     Range
	// AfterSeq is the keyset: reports with a greater report_seq. 0 starts at
	// the first.
	AfterSeq      int64
	TransactionID *string
}

// ListPair reads up to limit reports after q.AfterSeq, in report_seq order,
// and whether more follow.
func (r *Reader) ListPair(ctx context.Context, q PairQuery, limit int32) ([]UsageReport, bool, error) {
	rows, err := r.queries.ListPairUsageReports(ctx, db.ListPairUsageReportsParams{
		OrganizationID: q.OrganizationID,
		InstanceID:     q.InstanceID,
		EntitlementID:  q.EntitlementID,
		FromAt:         timestamp(q.Range.From),
		ToAt:           timestamp(q.Range.To),
		AfterSeq:       q.AfterSeq,
		TransactionID:  q.TransactionID,
		PageSize:       limit + 1,
	})
	if err != nil {
		return nil, false, fmt.Errorf("list usage reports: %w", err)
	}
	more := len(rows) > int(limit)
	if more {
		rows = rows[:limit]
	}
	reports := make([]UsageReport, len(rows))
	for i, row := range rows {
		reports[i] = fromRow(row)
	}
	return reports, more, nil
}

// OrganizationQuery selects an organization's reports in a range, optionally
// for one instance and one entitlement, either of which may be deleted.
type OrganizationQuery struct {
	OrganizationID uuid.UUID
	Range          Range
	InstanceID     *uuid.UUID
	EntitlementID  *uuid.UUID
}

// organizationCursor is the keyset of the organization-wide order.
type organizationCursor struct {
	reportedAt    time.Time
	instanceID    uuid.UUID
	entitlementID uuid.UUID
	reportSeq     int64
}

// startOf is a cursor before every report of r: one millisecond before its
// start, which reported_at >= from already excludes.
func startOf(r Range) organizationCursor {
	return organizationCursor{reportedAt: r.From.Add(-time.Millisecond)}
}

// listOrganization reads up to limit reports after cursor, in (reported_at,
// instance, entitlement, report_seq) order.
//
// Unlike a pair's report_seq, reported_at is not committed in order across
// pairs: a report whose clock was read just before the cursor's can commit
// just after the page was read. Only a range ending in the last seconds can
// miss such a row; a range in the past is stable.
func (r *Reader) listOrganization(ctx context.Context, q OrganizationQuery, after organizationCursor, limit int32) ([]UsageReport, bool, error) {
	rows, err := r.queries.ListOrganizationUsageReports(ctx, db.ListOrganizationUsageReportsParams{
		OrganizationID:     q.OrganizationID,
		FromAt:             timestamp(q.Range.From),
		ToAt:               timestamp(q.Range.To),
		InstanceID:         q.InstanceID,
		EntitlementID:      q.EntitlementID,
		AfterReportedAt:    timestamp(after.reportedAt),
		AfterInstanceID:    after.instanceID,
		AfterEntitlementID: after.entitlementID,
		AfterSeq:           after.reportSeq,
		PageSize:           limit + 1,
	})
	if err != nil {
		return nil, false, fmt.Errorf("list organization usage reports: %w", err)
	}
	more := len(rows) > int(limit)
	if more {
		rows = rows[:limit]
	}
	reports := make([]UsageReport, len(rows))
	for i, row := range rows {
		reports[i] = fromRow(db.ListPairUsageReportsRow(row))
	}
	return reports, more, nil
}

// Now is the usage clock, the instant reports are dated by, so a range ending
// now and the retention horizon agree with the journal they read.
func (r *Reader) Now(ctx context.Context) (time.Time, error) {
	now, err := r.queries.GetDatabaseNow(ctx)
	if err != nil {
		return time.Time{}, fmt.Errorf("read the database clock: %w", err)
	}
	return now.Time.UTC(), nil
}

// ResolveSlugs finds the instance and entitlement organizationID names by
// these slugs; uuid.Nil for one it does not have, or for an empty slug.
func (r *Reader) ResolveSlugs(ctx context.Context, organizationID uuid.UUID, instanceSlug, entitlementSlug string) (instanceID, entitlementID uuid.UUID, err error) {
	pair, err := r.queries.ResolveUsageReportPair(ctx, db.ResolveUsageReportPairParams{
		OrganizationID:  organizationID,
		InstanceSlug:    instanceSlug,
		EntitlementSlug: entitlementSlug,
	})
	if err != nil {
		return uuid.Nil, uuid.Nil, fmt.Errorf("resolve usage report pair: %w", err)
	}
	return pair.InstanceID, pair.EntitlementID, nil
}

// ResolvePair finds the pair a per-pair request names, or refuses it with
// <operation>.InstanceNotFound or <operation>.EntitlementNotFound.
func (r *Reader) ResolvePair(ctx context.Context, operation string, organizationID uuid.UUID, instanceSlug, entitlementSlug string) (instanceID, entitlementID uuid.UUID, err error) {
	instanceID, entitlementID, err = r.ResolveSlugs(ctx, organizationID, instanceSlug, entitlementSlug)
	switch {
	case err != nil:
		return uuid.Nil, uuid.Nil, err
	case instanceID == uuid.Nil:
		return uuid.Nil, uuid.Nil, apierrors.NotFoundf(operation+".InstanceNotFound", "instance %q not found", instanceSlug)
	case entitlementID == uuid.Nil:
		return uuid.Nil, uuid.Nil, apierrors.NotFoundf(operation+".EntitlementNotFound", "entitlement %q not found", entitlementSlug)
	}
	return instanceID, entitlementID, nil
}

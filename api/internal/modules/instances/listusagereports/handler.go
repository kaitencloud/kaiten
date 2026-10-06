package listusagereports

import (
	"context"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usagehistory"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usageledger"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

const (
	operation = "ListUsageReports"

	DefaultLimit = 100
	MaxLimit     = 500
)

type Deps struct {
	UserProvider currentuser.Provider
	DB           db.DBTX
	Retention    usageledger.Retention
}

type UseCase struct {
	deps   Deps
	reader *usagehistory.Reader
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{deps: deps, reader: usagehistory.NewReader(deps.DB)}
}

// Query is one page request. Nil From and To take their defaults (see
// usagehistory.ResolveRange); AfterSeq 0 starts at the first report.
type Query struct {
	From, To      *time.Time
	AfterSeq      int64
	Limit         int32
	TransactionID *string
}

// UsageReportPage is one page of a pair's usage history.
type UsageReportPage struct {
	Items []usagehistory.UsageReport `json:"items" nullable:"false" doc:"The reports, in reportSeq order"`
	// NextAfterSeq is a pointer so that the last page omits it.
	NextAfterSeq *int64 `json:"nextAfterSeq,omitempty" doc:"Pass as afterSeq to read the next page. Absent on the last page." example:"100"`
}

// Execute reads one page of the reports of the pair named by the slugs, within
// the organization's retention.
func (u *UseCase) Execute(ctx context.Context, instanceSlug, entitlementSlug string, q Query) (*UsageReportPage, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	instanceID, entitlementID, err := u.reader.ResolvePair(ctx, operation, user.OrganizationID, instanceSlug, entitlementSlug)
	if err != nil {
		return nil, err
	}

	now, err := u.reader.Now(ctx)
	if err != nil {
		return nil, err
	}
	retentionStart := u.deps.Retention.Start(ctx, user.OrganizationID, now)
	window, err := usagehistory.ResolveRange(operation, q.From, q.To, now, retentionStart, 0)
	if err != nil {
		return nil, err
	}

	limit := q.Limit
	if limit <= 0 {
		limit = DefaultLimit
	}
	items, more, err := u.reader.ListPair(ctx, usagehistory.PairQuery{
		OrganizationID: user.OrganizationID,
		InstanceID:     instanceID,
		EntitlementID:  entitlementID,
		Range:          window,
		AfterSeq:       q.AfterSeq,
		TransactionID:  q.TransactionID,
	}, limit)
	if err != nil {
		return nil, err
	}

	page := &UsageReportPage{Items: items}
	if more {
		next := items[len(items)-1].ReportSeq
		page.NextAfterSeq = &next
	}
	return page, nil
}

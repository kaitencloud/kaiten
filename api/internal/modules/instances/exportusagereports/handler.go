package exportusagereports

import (
	"context"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usagehistory"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usageledger"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

const (
	operation = "ExportUsageReports"
	// MaxSpan bounds one export of a pair to a year and a day.
	MaxSpan = 366 * 24 * time.Hour
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

// Query is an export request. Nil From and To take their defaults (see
// usagehistory.ResolveRange).
type Query struct {
	From, To *time.Time
	Format   usagehistory.Format
}

// Execute checks the request and returns the export of the pair's reports in
// the range, ready to stream. Nothing is read until it is written.
func (u *UseCase) Execute(ctx context.Context, instanceSlug, entitlementSlug string, q Query) (*usagehistory.Export, error) {
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
	window, err := usagehistory.ResolveRange(operation, q.From, q.To, now, retentionStart, MaxSpan)
	if err != nil {
		return nil, err
	}

	return usagehistory.NewPairExport(u.reader, usagehistory.PairQuery{
		OrganizationID: user.OrganizationID,
		InstanceID:     instanceID,
		EntitlementID:  entitlementID,
		Range:          window,
	}, q.Format, "usage-"+instanceSlug+"-"+entitlementSlug), nil
}

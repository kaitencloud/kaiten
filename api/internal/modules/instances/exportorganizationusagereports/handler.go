package exportorganizationusagereports

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usagehistory"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usageledger"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const (
	// operation is the per-pair export's: the two exports share their error
	// codes.
	operation = "ExportUsageReports"
	// MaxSpan bounds one organization-wide export to 31 days.
	MaxSpan = 31 * 24 * time.Hour
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

// Query is an organization-wide export request. Nil From and To take their
// defaults (see usagehistory.ResolveRange). A slug filter names a live
// instance or entitlement; an ID filter also reaches a deleted one, whose
// reports survive it. A slug and an ID given together must name the same one.
type Query struct {
	From, To        *time.Time
	Format          usagehistory.Format
	InstanceSlug    string
	InstanceID      *uuid.UUID
	EntitlementSlug string
	EntitlementID   *uuid.UUID
}

// Execute checks the request and returns the export of the organization's
// reports in the range, ready to stream. Nothing is read until it is written.
func (u *UseCase) Execute(ctx context.Context, q Query) (*usagehistory.Export, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	instanceID, entitlementID := q.InstanceID, q.EntitlementID
	if q.InstanceSlug != "" || q.EntitlementSlug != "" {
		bySlug, entitlementBySlug, err := u.reader.ResolveSlugs(ctx, user.OrganizationID, q.InstanceSlug, q.EntitlementSlug)
		if err != nil {
			return nil, err
		}
		if instanceID, err = filter(q.InstanceSlug, bySlug, instanceID, "InstanceNotFound", "instance"); err != nil {
			return nil, err
		}
		if entitlementID, err = filter(q.EntitlementSlug, entitlementBySlug, entitlementID, "EntitlementNotFound", "entitlement"); err != nil {
			return nil, err
		}
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

	return usagehistory.NewOrganizationExport(u.reader, usagehistory.OrganizationQuery{
		OrganizationID: user.OrganizationID,
		Range:          window,
		InstanceID:     instanceID,
		EntitlementID:  entitlementID,
	}, q.Format, "usage"), nil
}

// filter combines a slug filter, resolved to bySlug, with an ID filter: the
// slug must name something, and the same thing as the ID when both are given.
func filter(slug string, bySlug uuid.UUID, byID *uuid.UUID, code, noun string) (*uuid.UUID, error) {
	if slug == "" {
		return byID, nil
	}
	if bySlug == uuid.Nil || (byID != nil && *byID != bySlug) {
		return nil, apierrors.NotFoundf(operation+"."+code, "%s %q not found", noun, slug)
	}
	return &bySlug, nil
}

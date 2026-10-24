package exceptions

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	infraevents "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps is what the three exception use cases need.
type Deps struct {
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
}

// Queries binds the queries to the transaction ctx carries, else the pool.
func (d Deps) Queries(ctx context.Context) *db.Queries {
	return db.New(d.Uof.DBTX(ctx))
}

// Instance is the instance an exception is written on or read from.
type Instance struct {
	ID   uuid.UUID
	Slug string
}

// FindInstance is the organization's instance of that slug, locked for an
// exception write when lock is set; operation names the 404.
func FindInstance(ctx context.Context, q *db.Queries, organizationID uuid.UUID, slug string, lock bool, operation string) (Instance, error) {
	var (
		found Instance
		err   error
	)
	if lock {
		var row db.LockInstanceForExceptionRow
		row, err = q.LockInstanceForException(ctx, db.LockInstanceForExceptionParams{OrganizationID: organizationID, Slug: slug})
		found = Instance{ID: row.ID, Slug: row.Slug}
	} else {
		var row db.GetInstanceForExceptionRow
		row, err = q.GetInstanceForException(ctx, db.GetInstanceForExceptionParams{OrganizationID: organizationID, Slug: slug})
		found = Instance{ID: row.ID, Slug: row.Slug}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return Instance{}, kaitenerrors.NotFoundf(operation+".InstanceNotFound", "instance %q not found", slug)
	}
	return found, err
}

// Now is the instant an exception write or read is decided at: the
// database's clock, as the view's.
func Now(ctx context.Context, q *db.Queries) (time.Time, error) {
	now, err := q.ExceptionClock(ctx)
	if err != nil {
		return time.Time{}, err
	}
	return now.Time, nil
}

// List is the instance's exceptions, latest start first, with their status
// at now: all of them, or those neither revoked nor ended (scheduled ones
// included); only the one of that id when id is set.
func List(ctx context.Context, q *db.Queries, organizationID uuid.UUID, instance Instance, id *uuid.UUID, onlyActive bool, now time.Time) ([]EntitlementException, error) {
	rows, err := q.ListEntitlementExceptions(ctx, db.ListEntitlementExceptionsParams{
		OrganizationID: organizationID, InstanceID: instance.ID, ID: id, OnlyActive: onlyActive, Now: Timestamp(now),
	})
	if err != nil {
		return nil, err
	}
	out := make([]EntitlementException, 0, len(rows))
	for _, row := range rows {
		x := EntitlementException{
			ID: row.ID, InstanceSlug: instance.Slug, EntitlementSlug: row.EntitlementSlug, EntitlementType: string(row.EntitlementType),
			Kind: string(row.Kind), Value: Value(row.Value), StartsAt: row.StartsAt.Time, EndsAt: pgtime.PgTimeStampToTimePtr(row.EndsAt),
			Reason: row.Reason, Status: "", CreatedAt: row.CreatedAt.Time, RevokedAt: pgtime.PgTimeStampToTimePtr(row.RevokedAt),
		}
		x.Status = StatusAt(x.StartsAt, x.EndsAt, x.RevokedAt, now)
		out = append(out, x)
	}
	return out, nil
}

// Emit writes one of the exception events to the outbox, on the instance's
// audit trail.
func Emit(ctx context.Context, box *outbox.ScopedRepository, organizationID, instanceID uuid.UUID, event infraevents.Metadata, x EntitlementException) error {
	return box.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID, event.Name, event.Type, x.Event(),
		outbox.AuditHeaders{InstanceID: &instanceID}))
}

// Timestamp is a TIMESTAMP(3) parameter.
func Timestamp(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: t.UTC(), Valid: true, InfinityModifier: pgtype.Finite}
}

package cancelplanchange

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "CancelPlanChange"

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute drops the scheduled plan change.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string) (*subscriptions.InstanceBilling, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var result *subscriptions.InstanceBilling
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		sub, err := lifecycle.Lock(ctx, q, user.OrganizationID, instanceSlug, operation)
		if err != nil {
			return err
		}
		if sub.ScheduledLicensePriceID == nil {
			return kaitenerrors.Conflict(operation+".NoPlanChangeScheduled", "no plan change is scheduled")
		}
		now, err := lifecycle.Now(ctx, q)
		if err != nil {
			return err
		}
		if err := lifecycle.BoundaryPending(operation, sub, now); err != nil {
			return err
		}
		updated, err := q.SetScheduledChange(ctx, db.SetScheduledChangeParams{
			PriceID: nil, ScheduledAt: pgtype.Timestamp{}, UserID: user.ID, Now: invoices.Timestamp(now), ID: sub.ID,
		})
		if err != nil {
			return err
		}
		if err := lifecycle.AnnouncePlanChangeDropped(ctx, u.outbox, sub); err != nil {
			return err
		}
		result, err = subscriptions.Build(ctx, q, u.deps.Catalogue, updated)
		return err
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

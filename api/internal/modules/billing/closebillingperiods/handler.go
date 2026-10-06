package closebillingperiods

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	deps      access.Deps
	closer    *closing.Closer
	batchSize int
}

func NewUseCase(deps access.Deps, closer *closing.Closer, batchSize int) *UseCase {
	return &UseCase{deps: deps, closer: closer, batchSize: batchSize}
}

// Execute closes the caller's organization's due subscriptions now, or one
// instance's, recorded under the caller. Only what is due closes: a period
// that has not ended is left alone.
func (u *UseCase) Execute(ctx context.Context, instanceSlug *string) (*closing.ClosePeriodsReport, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	return u.close(ctx, user.OrganizationID, instanceSlug, func(context.Context, uuid.UUID) (uuid.UUID, error) {
		return user.ID, nil
	})
}

// ExecuteFor is Execute on behalf of the platform, for the named
// organization, recorded under system:kaiten.
func (u *UseCase) ExecuteFor(ctx context.Context, organizationID uuid.UUID, instanceSlug *string) (*closing.ClosePeriodsReport, error) {
	if err := u.deps.Gate.Require(ctx, organizationID); err != nil {
		return nil, err
	}
	return u.close(ctx, organizationID, instanceSlug, u.closer.SystemActor)
}

func (u *UseCase) close(ctx context.Context, organizationID uuid.UUID, instanceSlug *string, actorFor closing.ActorFor) (*closing.ClosePeriodsReport, error) {
	scope := closing.Scope{OrganizationID: &organizationID, InstanceID: nil}
	if instanceSlug != nil {
		instance, err := u.deps.Queries(ctx).GetInstanceBySlug(ctx, db.GetInstanceBySlugParams{OrganizationID: organizationID, Slug: *instanceSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFoundf("CloseBillingPeriods.InstanceNotFound", "instance %q not found", *instanceSlug)
		}
		if err != nil {
			return nil, err
		}
		scope.InstanceID = &instance.ID
	}
	report, err := u.closer.CloseDue(ctx, scope, u.batchSize, actorFor)
	if err != nil {
		return nil, err
	}
	return &report, nil
}

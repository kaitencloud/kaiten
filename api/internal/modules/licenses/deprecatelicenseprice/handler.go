package deprecatelicenseprice

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "DeprecateLicensePrice"

type UseCase struct {
	deps   prices.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps prices.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute retires a price from the catalogue. What is already billed from it
// keeps billing; it is no longer offered, and no longer a default.
func (u *UseCase) Execute(ctx context.Context, licenseSlug string, priceID uuid.UUID) (*prices.Price, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}

	var deprecated *prices.Price
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		queries := u.deps.Queries(ctx)
		version, err := prices.LockVersion(ctx, queries, operation, user.OrganizationID, licenseSlug)
		if err != nil {
			return err
		}
		stored, err := prices.Get(ctx, queries, user.OrganizationID, version.ID, priceID)
		if err != nil {
			return err
		}
		if stored == nil {
			return kaitenerrors.NotFoundf(operation+".NotFound", "price %s not found on license %q", priceID, licenseSlug)
		}
		target, err := queries.PriceIsPlanChangeTarget(ctx, db.PriceIsPlanChangeTargetParams{OrganizationID: user.OrganizationID, PriceID: &priceID})
		if err != nil {
			return err
		}
		if target {
			return kaitenerrors.Conflict(operation+".PlanChangeTarget",
				"a subscription is scheduled to move to this price at its next boundary; cancel the change first")
		}
		_, err = queries.DeprecateLicensePrice(ctx, db.DeprecateLicensePriceParams{
			UserID: user.ID, OrganizationID: user.OrganizationID, LicenseID: version.ID, ID: priceID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.Conflict(operation+".AlreadyDeprecated", "this price is already deprecated")
		}
		if err != nil {
			return err
		}
		deprecated, err = prices.Get(ctx, queries, user.OrganizationID, version.ID, priceID)
		if err != nil {
			return err
		}
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			user.OrganizationID, events.LicensePriceDeprecated.Name, events.LicensePriceDeprecated.Type,
			prices.Event{Price: *deprecated, LicenseSlug: licenseSlug, FamilySlug: version.FamilySlug}, nil,
		))
	})
	if err != nil {
		return nil, err
	}
	return deprecated, nil
}

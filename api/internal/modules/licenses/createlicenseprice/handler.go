package createlicenseprice

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "CreateLicensePrice"

type UseCase struct {
	deps   prices.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps prices.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute adds a price to a version. A DRAFT or PUBLISHED version takes new
// prices; an ARCHIVED one does not.
func (u *UseCase) Execute(ctx context.Context, licenseSlug string, draft prices.Draft) (*prices.Price, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if draft.BillingTiming == "" {
		draft.BillingTiming = prices.TimingAdvance
		if draft.Metered() {
			draft.BillingTiming = prices.TimingArrears
		}
	}
	currency, amount, err := draft.Shape(operation)
	if err != nil {
		return nil, err
	}

	var created *prices.Price
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		queries := u.deps.Queries(ctx)
		version, err := prices.LockVersion(ctx, queries, operation, user.OrganizationID, licenseSlug)
		if err != nil {
			return err
		}
		if version.LifecycleState == db.LicenseLifecycleStateARCHIVED {
			return kaitenerrors.Conflict(operation+".VersionArchived", "an archived licence version takes no new price")
		}

		params := db.InsertLicensePriceParams{
			OrganizationID:      user.OrganizationID,
			LicenseID:           version.ID,
			BillingModel:        db.BillingModel(draft.BillingModel),
			BillingTiming:       db.BillingTiming(draft.BillingTiming),
			BillingPeriod:       nil,
			UnitAmountDecimal:   amount.String(),
			Currency:            string(currency),
			MetersEntitlementID: nil,
			SaleUnitFactor:      nil,
			DisplayLabel:        draft.DisplayLabel,
			DisplayOrder:        draft.DisplayOrder,
			IsDefault:           draft.IsDefault,
			UserID:              user.ID,
		}
		if draft.BillingPeriod != nil {
			period := db.BillingPeriod(*draft.BillingPeriod)
			params.BillingPeriod = &period
		}
		if draft.Metered() {
			entitlement, err := prices.Entitlement(ctx, queries, operation, user.OrganizationID, version.ID, draft.MeteredEntitlementSlug)
			if err != nil {
				return err
			}
			others, err := queries.CountOtherActiveMeteredPrices(ctx, db.CountOtherActiveMeteredPricesParams{
				LicenseID: version.ID, EntitlementID: &entitlement.ID, ExceptPriceID: prices.NoPrice,
			})
			if err != nil {
				return err
			}
			factor, err := prices.Meters(operation, draft, entitlement, others)
			if err != nil {
				return err
			}
			params.MetersEntitlementID = &entitlement.ID
			params.SaleUnitFactor = &factor
		}

		id, err := queries.InsertLicensePrice(ctx, params)
		if err != nil {
			return prices.WriteError(operation, err)
		}
		created, err = prices.Get(ctx, queries, user.OrganizationID, version.ID, id)
		if err != nil {
			return err
		}
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			user.OrganizationID, events.LicensePriceCreated.Name, events.LicensePriceCreated.Type,
			prices.Event{Price: *created, LicenseSlug: licenseSlug, FamilySlug: version.FamilySlug}, nil,
		))
	})
	if err != nil {
		return nil, err
	}
	return created, nil
}

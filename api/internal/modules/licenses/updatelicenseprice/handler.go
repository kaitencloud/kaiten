package updatelicenseprice

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "UpdateLicensePrice"

// Patch is what an update may change; nil keeps the stored value. Currency and
// billing model are not among them: a price in another currency or of another
// shape is another price.
type Patch struct {
	BillingTiming          *string
	BillingPeriod          *string
	UnitAmountDecimal      *string
	MeteredEntitlementSlug *string
	DisplayLabel           *string
	DisplayOrder           *int32
	IsDefault              *bool
}

type UseCase struct {
	deps   prices.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps prices.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute edits a price of a DRAFT version. A published price never changes
// under what is billed from it: deprecation is its only change.
func (u *UseCase) Execute(ctx context.Context, licenseSlug string, priceID uuid.UUID, patch Patch) (*prices.Price, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}

	var updated *prices.Price
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
		if version.LifecycleState != db.LicenseLifecycleStateDRAFT {
			return kaitenerrors.Conflict(operation+".VersionNotDraft",
				"the prices of a published or archived version are immutable: deprecate this one, or price a new version")
		}

		draft, changed := merge(*stored, patch)
		_, amount, err := draft.Shape(operation)
		if err != nil {
			return err
		}
		params := db.UpdateLicensePriceParams{
			BillingTiming:       db.BillingTiming(draft.BillingTiming),
			BillingPeriod:       nil,
			UnitAmountDecimal:   amount.String(),
			MetersEntitlementID: nil,
			SaleUnitFactor:      nil,
			DisplayLabel:        draft.DisplayLabel,
			DisplayOrder:        draft.DisplayOrder,
			IsDefault:           draft.IsDefault,
			UserID:              user.ID,
			OrganizationID:      user.OrganizationID,
			LicenseID:           version.ID,
			ID:                  priceID,
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
				LicenseID: version.ID, EntitlementID: &entitlement.ID, ExceptPriceID: priceID,
			})
			if err != nil {
				return err
			}
			factor, err := prices.Meters(operation, draft, entitlement, others)
			if err != nil {
				return err
			}
			// The factor is captured once: re-pointing the price at another
			// entitlement captures that one's, keeping it otherwise.
			if stored.Metered != nil && stored.Metered.EntitlementSlug == draft.MeteredEntitlementSlug {
				factor = stored.Metered.SaleUnitFactor
			}
			params.MetersEntitlementID = &entitlement.ID
			params.SaleUnitFactor = &factor
		}

		if _, err := queries.UpdateLicensePrice(ctx, params); err != nil {
			return prices.WriteError(operation, err)
		}
		updated, err = prices.Get(ctx, queries, user.OrganizationID, version.ID, priceID)
		if err != nil {
			return err
		}
		if len(changed) == 0 {
			return nil
		}
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			user.OrganizationID, events.LicensePriceUpdated.Name, events.LicensePriceUpdated.Type,
			prices.LicensePriceUpdatedEvent{
				LicensePriceEvent:         prices.LicensePriceEvent{Price: *updated, LicenseSlug: licenseSlug, FamilySlug: version.FamilySlug},
				ChangedFields: changed,
			}, nil,
		))
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

// merge applies patch over the stored price and names what it changes.
func merge(stored prices.Price, patch Patch) (prices.Draft, []string) {
	draft := prices.Draft{
		BillingModel:      stored.BillingModel,
		BillingTiming:     stored.BillingTiming,
		BillingPeriod:     stored.BillingPeriod,
		Currency:          stored.Currency,
		UnitAmountDecimal: stored.UnitAmountDecimal,
		DisplayLabel:      stored.DisplayLabel,
		DisplayOrder:      stored.DisplayOrder,
		IsDefault:         stored.IsDefault,
	}
	if stored.Metered != nil {
		draft.MeteredEntitlementSlug = stored.Metered.EntitlementSlug
	}

	var changed []string
	setString := func(name string, current *string, patched *string) {
		if patched != nil && *patched != *current {
			*current = *patched
			changed = append(changed, name)
		}
	}
	setString("billingTiming", &draft.BillingTiming, patch.BillingTiming)
	setString("meteredEntitlementSlug", &draft.MeteredEntitlementSlug, patch.MeteredEntitlementSlug)
	if patch.UnitAmountDecimal != nil && *patch.UnitAmountDecimal != draft.UnitAmountDecimal {
		draft.UnitAmountDecimal = *patch.UnitAmountDecimal
		changed = append(changed, "unitAmountDecimal")
	}
	if patch.BillingPeriod != nil && (draft.BillingPeriod == nil || *patch.BillingPeriod != *draft.BillingPeriod) {
		draft.BillingPeriod = patch.BillingPeriod
		changed = append(changed, "billingPeriod")
	}
	if patch.DisplayLabel != nil && (draft.DisplayLabel == nil || *patch.DisplayLabel != *draft.DisplayLabel) {
		draft.DisplayLabel = patch.DisplayLabel
		changed = append(changed, "displayLabel")
	}
	if patch.DisplayOrder != nil && *patch.DisplayOrder != draft.DisplayOrder {
		draft.DisplayOrder = *patch.DisplayOrder
		changed = append(changed, "displayOrder")
	}
	if patch.IsDefault != nil && *patch.IsDefault != draft.IsDefault {
		draft.IsDefault = *patch.IsDefault
		changed = append(changed, "isDefault")
	}
	return draft, changed
}

package createaddonprice

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "CreateAddonPrice"

// NewAddonPrice is a price to add to an add-on version, shaped like a licence price.
type NewAddonPrice struct {
	BillingModel           string  `json:"billingModel" enum:"FLAT_FEE,USAGE_BASED,OVERAGE"`
	BillingTiming          string  `json:"billingTiming,omitempty" enum:"ADVANCE,ARREARS" doc:"Defaults to ADVANCE for a FLAT_FEE price and ARREARS for a metered one, which must be ARREARS."`
	BillingPeriod          *string `json:"billingPeriod,omitempty" enum:"MONTHLY,QUARTERLY,SEMI_ANNUAL,ANNUAL" doc:"Required on a FLAT_FEE price: it bills subscriptions of that period. Refused on a metered one."`
	Currency               string  `json:"currency" doc:"ISO 4217 code, upper case. One currency per add-on version." example:"EUR"`
	UnitAmountDecimal      string  `json:"unitAmountDecimal" doc:"Amount in minor units: per unit and period for FLAT_FEE, per sale unit for metered prices." example:"900"`
	MeteredEntitlementSlug string  `json:"meteredEntitlementSlug,omitempty" doc:"The entitlement a metered price measures: granted by the add-on version, with a reset period, SUM or COUNT, NUMBER or NUMBER_AI_CREDIT." example:"tokens"`
	DisplayLabel           *string `json:"displayLabel,omitempty" maxLength:"200"`
	DisplayOrder           int32   `json:"displayOrder,omitempty" minimum:"0"`
	IsDefault              bool    `json:"isDefault,omitempty" doc:"Makes this FLAT_FEE price the one that bills its period; the previous default of the period loses it."`
}

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute adds the price.
func (u *UseCase) Execute(ctx context.Context, addonSlug string, command NewAddonPrice) (*prices.Price, error) {
	draft := prices.Draft{
		BillingModel: command.BillingModel, BillingTiming: command.BillingTiming, BillingPeriod: command.BillingPeriod,
		Currency: command.Currency, UnitAmountDecimal: command.UnitAmountDecimal,
		MeteredEntitlementSlug: command.MeteredEntitlementSlug, DisplayLabel: command.DisplayLabel,
		DisplayOrder: command.DisplayOrder, IsDefault: command.IsDefault,
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
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var created prices.Price
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		locked, err := catalogue.Lock(ctx, q, user.OrganizationID, addonSlug, operation+".AddonNotFound")
		if err != nil {
			return err
		}
		if string(locked.Row.LifecycleState) == catalogue.Archived {
			return kaitenerrors.Conflict(operation+".VersionArchived", "an archived add-on version takes no new price")
		}
		if err := catalogue.RefuseBilled(ctx, q, operation, user.OrganizationID, locked.Row.ID); err != nil {
			return err
		}
		params := db.InsertAddonPriceParams{
			OrganizationID: user.OrganizationID, AddonID: locked.Row.ID, BillingModel: db.BillingModel(draft.BillingModel),
			BillingTiming: db.BillingTiming(draft.BillingTiming), BillingPeriod: nil, UnitAmountDecimal: amount.String(),
			Currency: string(currency), MetersEntitlementID: nil, SaleUnitFactor: nil, DisplayLabel: draft.DisplayLabel,
			DisplayOrder: draft.DisplayOrder, IsDefault: draft.IsDefault, UserID: user.ID,
		}
		if draft.BillingPeriod != nil {
			period := db.BillingPeriod(*draft.BillingPeriod)
			params.BillingPeriod = &period
			if draft.IsDefault {
				if err := q.ClearAddonPriceDefault(ctx, db.ClearAddonPriceDefaultParams{
					UserID: user.ID, OrganizationID: user.OrganizationID, AddonID: locked.Row.ID, BillingPeriod: period,
				}); err != nil {
					return err
				}
			}
		}
		if draft.Metered() {
			factor, entitlementID, err := meters(ctx, q, user.OrganizationID, locked.Row.ID, draft)
			if err != nil {
				return err
			}
			params.MetersEntitlementID = &entitlementID
			params.SaleUnitFactor = &factor
		}
		id, err := q.InsertAddonPrice(ctx, params)
		if kaitenerrors.IsCheckViolationOnConstraint(err, "addon_price_single_currency") {
			return kaitenerrors.UnprocessableEntity(operation+".CurrencyMismatch",
				"this add-on version already has prices in another currency: one currency per version")
		}
		if kaitenerrors.IsUniqueViolationOnConstraint(err, "addon_price_addon_id_billing_period_default_key") {
			return kaitenerrors.Conflict(operation+".DefaultConflict", "another price was made the default of this period concurrently; retry")
		}
		if err != nil {
			return err
		}
		all, err := catalogue.Prices(ctx, q, user.OrganizationID, []uuid.UUID{locked.Row.ID}, nil)
		if err != nil {
			return err
		}
		for _, price := range all[locked.Row.ID] {
			if price.ID == id {
				created = price
			}
		}
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID,
			events.AddonPriceCreated.Name, events.AddonPriceCreated.Type,
			catalogue.AddonPriceUpdate{Price: created, AddonSlug: addonSlug}, nil))
	})
	if err != nil {
		return nil, err
	}
	return &created, nil
}

// meters checks the entitlement a metered add-on price measures, under the
// rules of a licence price, and returns the sale-unit factor to snapshot.
func meters(ctx context.Context, q *db.Queries, organizationID, addonID uuid.UUID, draft prices.Draft) (string, uuid.UUID, error) {
	entitlement, err := q.GetAddonPricingEntitlement(ctx, db.GetAddonPricingEntitlementParams{
		AddonID: addonID, OrganizationID: organizationID, Slug: draft.MeteredEntitlementSlug,
	})
	if err != nil {
		return "", uuid.Nil, kaitenerrors.NotFoundf(operation+".EntitlementNotFound", "entitlement %q not found", draft.MeteredEntitlementSlug)
	}
	switch {
	case entitlement.ResetPeriod == nil:
		return "", uuid.Nil, kaitenerrors.UnprocessableEntity(operation+".EntitlementIsStock",
			"only an entitlement with a reset period can be metered")
	case entitlement.AggregationMethod == nil ||
		(*entitlement.AggregationMethod != db.AggregationMethodSUM && *entitlement.AggregationMethod != db.AggregationMethodCOUNT):
		return "", uuid.Nil, kaitenerrors.UnprocessableEntity(operation+".UnsupportedAggregation", "only a SUM or COUNT entitlement can be metered")
	case entitlement.Type != db.EntitlementTypeNUMBER && entitlement.Type != db.EntitlementTypeNUMBERAICREDIT:
		return "", uuid.Nil, kaitenerrors.UnprocessableEntity(operation+".UnsupportedEntitlementType",
			"only a NUMBER or NUMBER_AI_CREDIT entitlement can be metered")
	case entitlement.GrantValue == nil:
		return "", uuid.Nil, kaitenerrors.UnprocessableEntity(operation+".EntitlementNotGranted",
			"the add-on version does not grant this entitlement")
	}
	others, err := q.CountOtherActiveMeteredAddonPrices(ctx, db.CountOtherActiveMeteredAddonPricesParams{
		AddonID: addonID, EntitlementID: &entitlement.ID, ExceptID: uuid.Nil,
	})
	if err != nil {
		return "", uuid.Nil, err
	}
	if others > 0 {
		return "", uuid.Nil, kaitenerrors.UnprocessableEntity(operation+".EntitlementAlreadyMetered",
			"another active price of this add-on version already meters this entitlement")
	}
	factor := entitlement.SaleUnitFactor
	if factor == "" {
		factor = "1"
	}
	return factor, entitlement.ID, nil
}

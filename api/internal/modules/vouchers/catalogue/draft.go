package catalogue

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// VoucherDraft is a voucher as a create or an update gives it.
type VoucherDraft struct {
	Code                      *string         `json:"code,omitempty" doc:"8 to 64 of [A-Za-z0-9_-]. Generated when absent: 16 characters, 80 random bits. Matched without case or separators." example:"SUMMER-2026-LAUNCH"`
	Name                      string          `json:"name" minLength:"1" maxLength:"200" example:"Summer launch"`
	Description               *string         `json:"description,omitempty" maxLength:"2000"`
	VoucherType               string          `json:"voucherType" enum:"PRICE,ENTITLEMENT_BOOST"`
	Duration                  string          `json:"duration" enum:"ONE_TIME,REPEATING,FOREVER"`
	DurationInPeriods         *int32          `json:"durationInPeriods,omitempty" doc:"Required with REPEATING, refused otherwise"`
	MaxRedemptions            *int32          `json:"maxRedemptions,omitempty" minimum:"1"`
	StartsAt                  *time.Time      `json:"startsAt,omitempty"`
	ExpiresAt                 *time.Time      `json:"expiresAt,omitempty"`
	PriceDiscountType         *string         `json:"priceDiscountType,omitempty" enum:"PERCENTAGE,FIXED_AMOUNT"`
	PriceDiscountValue        *string         `json:"priceDiscountValue,omitempty" doc:"A percentage in (0, 100], or an integer amount in minor units" example:"30"`
	Currency                  *string         `json:"currency,omitempty" doc:"Required with FIXED_AMOUNT, refused otherwise" example:"EUR"`
	PriceAppliesTo            *string         `json:"priceAppliesTo,omitempty" enum:"LICENSE_BASE,ADDONS,BOTH,SELECTED_PRICES"`
	ApplicableLicensePriceIDs []uuid.UUID     `json:"applicableLicensePriceIds,omitempty" doc:"With SELECTED_PRICES: the licence prices it discounts"`
	ApplicableAddonPriceIDs   []uuid.UUID     `json:"applicableAddonPriceIds,omitempty" doc:"With SELECTED_PRICES: the add-on prices it discounts"`
	Grants                    []Grant         `json:"grants,omitempty" doc:"Required on an ENTITLEMENT_BOOST, refused on a PRICE voucher"`
	ApplicableLicenseIDs      []uuid.UUID     `json:"applicableLicenseIds,omitempty"`
	ApplicableAddonIDs        []uuid.UUID     `json:"applicableAddonIds,omitempty"`
	RestrictedCustomerSlug    *string         `json:"restrictedCustomerSlug,omitempty"`
	RedemptionRules           RedemptionRules `json:"redemptionRules,omitempty"`
}

// Resolved is a draft checked against the organization, ready to write.
type Resolved struct {
	Code         string
	Params       db.InsertVoucherParams
	Entitlements []uuid.UUID
}

// Resolve checks the draft and reads what it names. Reasons are prefixed by
// operation ("CreateVoucher").
func (d VoucherDraft) Resolve(ctx context.Context, q *db.Queries, operation string, organizationID, userID uuid.UUID) (Resolved, error) {
	invalid := func(code, reason string) error { return kaitenerrors.UnprocessableEntity(operation+"."+code, reason) }

	code := ""
	if d.Code != nil {
		code = *d.Code
		if !ValidCode(code) {
			return Resolved{}, invalid("InvalidCode", "a code is 8 to 64 of A-Z, a-z, 0-9, _ and -")
		}
		if len(code) < 12 && d.MaxRedemptions == nil && d.ExpiresAt == nil {
			return Resolved{}, invalid("WeakCodeUnbounded",
				"a code shorter than 12 characters can be guessed: bound it with maxRedemptions or expiresAt")
		}
	} else {
		generated, err := GenerateCode()
		if err != nil {
			return Resolved{}, err
		}
		code = generated
	}
	if d.VoucherType != TypePrice && d.VoucherType != TypeBoost {
		return Resolved{}, invalid("UnsupportedType", "a voucher is PRICE or ENTITLEMENT_BOOST")
	}
	if (d.Duration == DurationRepeating) != (d.DurationInPeriods != nil) || (d.DurationInPeriods != nil && *d.DurationInPeriods < 1) {
		return Resolved{}, invalid("InvalidDuration", "durationInPeriods, at least 1, goes with REPEATING and only with it")
	}
	if d.StartsAt != nil && d.ExpiresAt != nil && !d.StartsAt.Before(*d.ExpiresAt) {
		return Resolved{}, invalid("InvalidWindow", "startsAt is before expiresAt")
	}
	rules, err := json.Marshal(d.RedemptionRules)
	if err != nil {
		return Resolved{}, err
	}
	if m := d.RedemptionRules.MinimumSubscriptionAmount; m != nil {
		if _, err := money.ParseCurrency(m.Currency); err != nil {
			return Resolved{}, invalid("InvalidCurrency", "minimumSubscriptionAmount.currency is an upper-case ISO 4217 code")
		}
		if _, err := money.ParseUnitAmount(m.UnitAmountDecimal); err != nil {
			return Resolved{}, invalid("InvalidRedemptionRules", "minimumSubscriptionAmount.unitAmountDecimal is a non-negative decimal in minor units")
		}
	}

	params := db.InsertVoucherParams{
		OrganizationID: organizationID, Code: code, Name: d.Name, Description: d.Description,
		VoucherType: db.VoucherType(d.VoucherType), Duration: db.VoucherDuration(d.Duration),
		DurationInPeriods: d.DurationInPeriods, MaxRedemptions: d.MaxRedemptions,
		StartsAt: Timestamp(d.StartsAt), ExpiresAt: Timestamp(d.ExpiresAt), PriceDiscountType: nil,
		PriceDiscountValue: nil, Currency: nil, PriceAppliesTo: nil,
		ApplicableLicensePriceIds: nonNil(d.ApplicableLicensePriceIDs), ApplicableAddonPriceIds: nonNil(d.ApplicableAddonPriceIDs),
		ApplicableLicenseIds: nonNil(d.ApplicableLicenseIDs), ApplicableAddonIds: nonNil(d.ApplicableAddonIDs),
		RestrictedCustomerID: nil, RedemptionRules: rules, UserID: userID,
	}

	var entitlements []uuid.UUID
	switch d.VoucherType {
	case TypePrice:
		if len(d.Grants) > 0 {
			return Resolved{}, invalid("InvalidDiscount", "a PRICE voucher grants nothing: omit grants")
		}
		if err := d.discount(operation, &params); err != nil {
			return Resolved{}, err
		}
		if err := countAll(ctx, operation+".PriceNotFound", "a selected price does not exist",
			func() (int32, error) {
				return q.CountLicensePrices(ctx, db.CountLicensePricesParams{OrganizationID: organizationID, Ids: params.ApplicableLicensePriceIds})
			}, len(params.ApplicableLicensePriceIds)); err != nil {
			return Resolved{}, err
		}
		if err := countAll(ctx, operation+".PriceNotFound", "a selected add-on price does not exist",
			func() (int32, error) {
				return q.CountAddonPrices(ctx, db.CountAddonPricesParams{OrganizationID: organizationID, Ids: params.ApplicableAddonPriceIds})
			}, len(params.ApplicableAddonPriceIds)); err != nil {
			return Resolved{}, err
		}
	case TypeBoost:
		if d.PriceDiscountType != nil || d.PriceDiscountValue != nil || d.Currency != nil || d.PriceAppliesTo != nil ||
			len(d.ApplicableLicensePriceIDs) > 0 || len(d.ApplicableAddonPriceIDs) > 0 {
			return Resolved{}, invalid("InvalidDiscount", "an ENTITLEMENT_BOOST discounts nothing: omit the price members")
		}
		if len(d.Grants) == 0 {
			return Resolved{}, invalid("GrantsRequired", "an ENTITLEMENT_BOOST names at least one grant")
		}
		for _, grant := range d.Grants {
			entitlement, err := q.GetBoostableEntitlement(ctx, db.GetBoostableEntitlementParams{OrganizationID: organizationID, Slug: grant.EntitlementSlug})
			if errors.Is(err, pgx.ErrNoRows) {
				return Resolved{}, kaitenerrors.NotFoundf(operation+".EntitlementNotFound", "entitlement %q not found", grant.EntitlementSlug)
			}
			if err != nil {
				return Resolved{}, err
			}
			if entitlement.Type != db.EntitlementTypeNUMBER && entitlement.Type != db.EntitlementTypeNUMBERAICREDIT {
				return Resolved{}, invalid("BoostUnsupportedEntitlementType", "a boost changes a NUMBER or NUMBER_AI_CREDIT entitlement only")
			}
			if err := grant.validate(operation); err != nil {
				return Resolved{}, err
			}
			entitlements = append(entitlements, entitlement.ID)
		}
	}

	if err := countAll(ctx, operation+".LicenseNotFound", "an applicable licence version does not exist",
		func() (int32, error) {
			return q.CountLicenses(ctx, db.CountLicensesParams{OrganizationID: organizationID, Ids: params.ApplicableLicenseIds})
		}, len(params.ApplicableLicenseIds)); err != nil {
		return Resolved{}, err
	}
	if err := countAll(ctx, operation+".AddonNotFound", "an applicable add-on version does not exist",
		func() (int32, error) {
			return q.CountAddons(ctx, db.CountAddonsParams{OrganizationID: organizationID, Ids: params.ApplicableAddonIds})
		}, len(params.ApplicableAddonIds)); err != nil {
		return Resolved{}, err
	}
	if d.RestrictedCustomerSlug != nil {
		customerID, err := q.GetCustomerIDBySlug(ctx, db.GetCustomerIDBySlugParams{OrganizationID: organizationID, Slug: *d.RestrictedCustomerSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return Resolved{}, kaitenerrors.NotFoundf(operation+".CustomerNotFound", "customer %q not found", *d.RestrictedCustomerSlug)
		}
		if err != nil {
			return Resolved{}, err
		}
		params.RestrictedCustomerID = &customerID
	}
	return Resolved{Code: code, Params: params, Entitlements: entitlements}, nil
}

// discount checks a PRICE voucher's discount and copies it to params.
func (d VoucherDraft) discount(operation string, params *db.InsertVoucherParams) error {
	invalid := func(code, reason string) error { return kaitenerrors.UnprocessableEntity(operation+"."+code, reason) }
	if d.PriceDiscountType == nil || d.PriceDiscountValue == nil || d.PriceAppliesTo == nil {
		return invalid("InvalidDiscount", "a PRICE voucher names priceDiscountType, priceDiscountValue and priceAppliesTo")
	}
	value, err := decimal.NewFromString(*d.PriceDiscountValue)
	if err != nil || !value.IsPositive() {
		return invalid("InvalidDiscount", "priceDiscountValue is a positive decimal")
	}
	switch *d.PriceDiscountType {
	case DiscountPercentage:
		if value.GreaterThan(decimal.NewFromInt(100)) {
			return invalid("InvalidDiscount", "a percentage is at most 100")
		}
		if d.Currency != nil {
			return invalid("InvalidCurrency", "a percentage has no currency")
		}
	case DiscountFixed:
		if !value.IsInteger() {
			return invalid("InvalidDiscount", "a fixed amount is an integer number of minor units")
		}
		if d.Currency == nil {
			return invalid("CurrencyRequired", "a fixed amount names its currency")
		}
		if _, err := money.ParseCurrency(*d.Currency); err != nil {
			return invalid("InvalidCurrency", "currency is an upper-case ISO 4217 code")
		}
	default:
		return invalid("InvalidDiscount", "priceDiscountType is PERCENTAGE or FIXED_AMOUNT")
	}
	selected := len(d.ApplicableLicensePriceIDs)+len(d.ApplicableAddonPriceIDs) > 0
	if (*d.PriceAppliesTo == AppliesSelected) != selected {
		return invalid("SelectedPricesRequired", "SELECTED_PRICES names the prices it discounts, and only it does")
	}
	discountType := db.PriceDiscountType(*d.PriceDiscountType)
	applies := db.PriceAppliesTo(*d.PriceAppliesTo)
	formatted := value.String()
	params.PriceDiscountType = &discountType
	params.PriceDiscountValue = &formatted
	params.Currency = d.Currency
	params.PriceAppliesTo = &applies
	return nil
}

func (g Grant) validate(operation string) error {
	invalid := kaitenerrors.UnprocessableEntity(operation+".InvalidGrant",
		"modifierValue is >= 0 for SET, > 0 for ADD and MULTIPLY, and absent for UNLIMITED")
	if g.ModifierType == "UNLIMITED" {
		if g.ModifierValue != nil {
			return invalid
		}
		return nil
	}
	if g.ModifierValue == nil {
		return invalid
	}
	value, err := decimal.NewFromString(*g.ModifierValue)
	if err != nil || value.IsNegative() || (g.ModifierType != "SET" && value.IsZero()) {
		return invalid
	}
	return nil
}

func countAll(_ context.Context, code, reason string, count func() (int32, error), want int) error {
	if want == 0 {
		return nil
	}
	got, err := count()
	if err != nil {
		return err
	}
	if int(got) != want {
		return kaitenerrors.NotFound(code, reason)
	}
	return nil
}

// WriteGrants replaces a voucher's grants.
func WriteGrants(ctx context.Context, q *db.Queries, operation string, organizationID, voucherID uuid.UUID, grants []Grant, entitlements []uuid.UUID) error {
	if err := q.DeleteVoucherGrants(ctx, db.DeleteVoucherGrantsParams{OrganizationID: organizationID, VoucherID: voucherID}); err != nil {
		return err
	}
	for i, grant := range grants {
		if err := q.InsertVoucherGrant(ctx, db.InsertVoucherGrantParams{
			OrganizationID: organizationID, VoucherID: voucherID, EntitlementID: entitlements[i],
			ModifierType: db.BoostModifierType(grant.ModifierType), ModifierValue: grant.ModifierValue,
		}); err != nil {
			if kaitenerrors.IsUniqueViolationOnConstraint(err, "voucher_entitlement_grant_voucher_id_entitlement_id_key") {
				return kaitenerrors.UnprocessableEntity(operation+".DuplicateGrant", "one grant per entitlement")
			}
			return err
		}
	}
	return nil
}

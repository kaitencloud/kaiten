package prices

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Constraint names the write maps to reasons.
const (
	singleCurrencyConstraint = "license_price_single_currency"
	defaultConstraint        = "license_price_license_id_billing_period_default_key"
)

// WriteError maps a constraint a price write tripped to its reason.
func WriteError(operation string, err error) error {
	switch {
	case kaitenerrors.IsCheckViolationOnConstraint(err, singleCurrencyConstraint):
		return kaitenerrors.UnprocessableEntity(operation+".CurrencyMismatch",
			"this licence version already has prices in another currency: one currency per version")
	case kaitenerrors.IsUniqueViolationOnConstraint(err, defaultConstraint):
		return kaitenerrors.Conflict(operation+".DefaultConflict",
			"another price is already the default for this billing period")
	default:
		return err
	}
}

// Get reads one price of a version, or (nil, nil) when it has none of that id.
func Get(ctx context.Context, queries *db.Queries, organizationID, licenseID, priceID uuid.UUID) (*Price, error) {
	row, err := queries.GetLicensePrice(ctx, db.GetLicensePriceParams{
		OrganizationID: organizationID, LicenseID: licenseID, ID: priceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	price := fromRow(db.ListLicensePricesRow(row))
	return &price, nil
}

// List reads a version's prices in display order, optionally one status or
// billing model.
func List(ctx context.Context, queries *db.Queries, organizationID, licenseID uuid.UUID, status, billingModel string) ([]Price, error) {
	params := db.ListLicensePricesParams{OrganizationID: organizationID, LicenseID: licenseID, Status: nil, BillingModel: nil}
	if status != "" {
		s := db.PriceStatus(status)
		params.Status = &s
	}
	if billingModel != "" {
		m := db.BillingModel(billingModel)
		params.BillingModel = &m
	}
	rows, err := queries.ListLicensePrices(ctx, params)
	if err != nil {
		return nil, err
	}
	out := make([]Price, len(rows))
	for i, row := range rows {
		out[i] = fromRow(row)
	}
	return out, nil
}

// Amount is a price's unit amount as a decimal.
func (p Price) Amount() decimal.Decimal {
	amount, _ := decimal.NewFromString(p.UnitAmountDecimal)
	return amount
}

// Factor is a metered price's sale-unit factor as a decimal; 1 otherwise.
func (p Price) Factor() decimal.Decimal {
	if p.Metered == nil {
		return decimal.NewFromInt(1)
	}
	factor, err := decimal.NewFromString(p.Metered.SaleUnitFactor)
	if err != nil || !factor.IsPositive() {
		return decimal.NewFromInt(1)
	}
	return factor
}

func fromRow(row db.ListLicensePricesRow) Price {
	amount, _ := decimal.NewFromString(row.UnitAmountDecimal)
	price := Price{
		ID:                row.ID,
		BillingModel:      string(row.BillingModel),
		BillingTiming:     string(row.BillingTiming),
		Currency:          row.Currency,
		UnitAmountDecimal: money.FormatDecimal(amount),
		DisplayLabel:      row.DisplayLabel,
		DisplayOrder:      row.DisplayOrder,
		IsDefault:         row.IsDefault,
		Status:            string(row.Status),
		DeprecatedAt:      timePtr(row.DeprecatedAt),
		CreatedAt:         row.CreatedAt.Time.UTC(),
		UpdatedAt:         row.UpdatedAt.Time.UTC(),
	}
	if row.BillingPeriod != nil {
		period := string(*row.BillingPeriod)
		price.BillingPeriod = &period
	}
	if minor, ok := money.IntegralMinor(amount); ok {
		price.UnitAmount = &minor
	}
	if row.MetersEntitlementID != nil && row.EntitlementSlug != nil {
		factor, _ := decimal.NewFromString(row.SaleUnitFactor)
		price.Metered = &Meter{
			EntitlementSlug:  *row.EntitlementSlug,
			SaleUnitFactor:   money.FormatDecimal(factor),
			SaleUnitSingular: row.SaleUnitSingular,
			SaleUnitPlural:   row.SaleUnitPlural,
		}
	}
	return price
}

func timePtr(ts pgtype.Timestamp) *time.Time {
	if !ts.Valid {
		return nil
	}
	t := ts.Time.UTC()
	return &t
}

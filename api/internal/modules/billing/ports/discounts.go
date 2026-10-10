package ports

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Discount is a PRICE voucher an instance redeemed, as billing applies it.
type Discount struct {
	InstanceVoucherID uuid.UUID
	VoucherID         uuid.UUID
	Name              string
	Type              string
	Value             decimal.Decimal
	Currency          string
	AppliesTo         string
	LicensePriceIDs   []uuid.UUID
	AddonPriceIDs     []uuid.UUID
	Applications      int32
	ApplicationsMax   *int32
}

// DiscountSource is the PRICE vouchers an instance redeemed, as billing reads
// and consumes them. Every method acts in the transaction ctx carries.
type DiscountSource interface {
	// PreviewDiscount reads a voucher by code as a preview applies it
	// (§8.9): the discount a redemption of it would apply, no application
	// consumed. found is false when no voucher has the code; the discount is
	// nil when it has one that is not an ACTIVE PRICE voucher.
	PreviewDiscount(ctx context.Context, organizationID uuid.UUID, code string) (discount *Discount, found bool, err error)
	// Discounts reads the redemptions that may apply to an invoice composed
	// at the instant: redeemed by then, in their window, ACTIVE; oldest
	// first.
	Discounts(ctx context.Context, organizationID, instanceID uuid.UUID, at time.Time) ([]Discount, error)
	// Applied records that an issued invoice received a DISCOUNT line from
	// the redemption; reaching its limit expires it.
	Applied(ctx context.Context, organizationID, instanceVoucherID uuid.UUID, applicationsMax *int32, now time.Time) error
}

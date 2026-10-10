// Package billablediscounts is the PRICE vouchers an instance redeemed, as
// billing reads and consumes them: the voucher module's implementation of
// billing's ports.DiscountSource.
package billablediscounts

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
)

// Source implements ports.DiscountSource.
type Source struct {
	uof    *uow.UnitOfWork
	outbox *outbox.ScopedRepository
}

// New returns a source acting in the transaction its callers carry.
func New(uof *uow.UnitOfWork) *Source {
	return &Source{uof: uof, outbox: outbox.NewScopedRepository(uof)}
}

var _ ports.DiscountSource = (*Source)(nil)

// Discounts implements ports.DiscountSource.
func (s *Source) Discounts(ctx context.Context, organizationID, instanceID uuid.UUID, at time.Time) ([]ports.Discount, error) {
	rows, err := db.New(s.uof.DBTX(ctx)).ListApplicableDiscounts(ctx, db.ListApplicableDiscountsParams{
		OrganizationID: organizationID, InstanceID: instanceID, At: stamp(at),
	})
	if err != nil {
		return nil, err
	}
	out := make([]ports.Discount, 0, len(rows))
	for _, row := range rows {
		if row.PriceDiscountType == nil || row.PriceAppliesTo == nil {
			continue
		}
		value, err := decimal.NewFromString(row.PriceDiscountValue)
		if err != nil {
			return nil, err
		}
		out = append(out, ports.Discount{
			InstanceVoucherID: row.InstanceVoucherID, VoucherID: row.VoucherID, Name: row.Name,
			Type: string(*row.PriceDiscountType), Value: value, Currency: row.Currency,
			AppliesTo: string(*row.PriceAppliesTo), LicensePriceIDs: row.ApplicableLicensePriceIds,
			AddonPriceIDs: row.ApplicableAddonPriceIds, Applications: row.ApplicationsCount,
			ApplicationsMax: catalogue.ApplicationsMax(row.Duration, row.DurationInPeriods),
		})
	}
	return out, nil
}

// Applied implements ports.DiscountSource. A redemption that reaches its
// limit expires, with INSTANCE_VOUCHER_EXPIRED.
func (s *Source) Applied(ctx context.Context, organizationID, instanceVoucherID uuid.UUID, applicationsMax *int32, now time.Time) error {
	q := db.New(s.uof.DBTX(ctx))
	status, err := q.ApplyDiscount(ctx, db.ApplyDiscountParams{
		ApplicationsMax: applicationsMax, Now: stamp(now), OrganizationID: organizationID, ID: instanceVoucherID,
	})
	if err != nil || status != db.InstanceVoucherStatusEXPIRED {
		return err
	}
	list, err := catalogue.Redemptions(ctx, q, db.ListRedemptionsParams{
		OrganizationID: organizationID, InstanceID: nil, VoucherID: nil, ID: &instanceVoucherID, Status: nil,
		CursorAt: pgtype.Timestamp{}, CursorID: nil, RowLimit: nil,
	})
	if err != nil || len(list) == 0 {
		return err
	}
	return s.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID,
		events.InstanceVoucherExpired.Name, events.InstanceVoucherExpired.Type, list[0], nil))
}

func stamp(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: t.UTC(), Valid: true, InfinityModifier: pgtype.Finite}
}

// errNoVoucher is what One answers for a code no voucher has.
var errNoVoucher = errors.New("no voucher has this code")

// PreviewDiscount implements ports.DiscountSource.
func (s *Source) PreviewDiscount(ctx context.Context, organizationID uuid.UUID, code string) (*ports.Discount, bool, error) {
	voucher, err := catalogue.One(ctx, db.New(s.uof.DBTX(ctx)), organizationID, nil, &code, false, errNoVoucher)
	if errors.Is(err, errNoVoucher) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if voucher.Status != catalogue.StatusActive || voucher.VoucherType != catalogue.TypePrice ||
		voucher.PriceDiscountType == nil || voucher.PriceDiscountValue == nil || voucher.PriceAppliesTo == nil {
		return nil, true, nil
	}
	value, err := decimal.NewFromString(*voucher.PriceDiscountValue)
	if err != nil {
		return nil, true, err
	}
	currency := ""
	if voucher.Currency != nil {
		currency = *voucher.Currency
	}
	return &ports.Discount{
		InstanceVoucherID: uuid.Nil, VoucherID: voucher.ID, Name: voucher.Name, Type: *voucher.PriceDiscountType,
		Value: value, Currency: currency, AppliesTo: *voucher.PriceAppliesTo,
		LicensePriceIDs: voucher.ApplicableLicensePriceIDs, AddonPriceIDs: voucher.ApplicableAddonPriceIDs,
		Applications: 0, ApplicationsMax: catalogue.ApplicationsMax(db.VoucherDuration(voucher.Duration), voucher.DurationInPeriods),
	}, true, nil
}

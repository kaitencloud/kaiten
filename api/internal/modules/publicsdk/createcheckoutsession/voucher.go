package createcheckoutsession

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/validatevoucher"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Vouchers checks a visitor's code against the checkout's selection, with no
// customer and no instance (§11.4, V32-01): the vouchers module's own check,
// through a port this module owns.
type Vouchers interface {
	Visitor(ctx context.Context, check validatevoucher.VisitorCheck) (*catalogue.Voucher, error)
}

// SelectedVoucher checks code for the selection, at the start and again at
// the confirm (§14.8 rule 5): every refusal is the same opaque 422
// <operation>.VoucherInvalid. A voucher whose redemption could not be
// recorded at payment -- one without a PRICE part, when an amount is due --
// is refused too, by the caller, once it knows the amount (§9.10).
func SelectedVoucher(ctx context.Context, vouchers Vouchers, operation string, organizationID uuid.UUID, code string,
	priceID uuid.UUID, addOns []checkout.SelectedAddon,
) (*catalogue.Voucher, error) {
	if vouchers == nil {
		return nil, VoucherInvalid(operation)
	}
	addonIDs := make([]uuid.UUID, len(addOns))
	for i, addon := range addOns {
		addonIDs[i] = addon.AddonID
	}
	voucher, err := vouchers.Visitor(ctx, validatevoucher.VisitorCheck{
		OrganizationID: organizationID, Code: code, LicensePriceID: priceID, AddonIDs: addonIDs,
	})
	if err != nil {
		return nil, err
	}
	if voucher == nil {
		return nil, VoucherInvalid(operation)
	}
	return voucher, nil
}

// PricedCode is the code whose discount dueToday counts: the code of a
// voucher with a PRICE part, else none.
func PricedCode(voucher *catalogue.Voucher, code string) *string {
	if voucher == nil || voucher.PriceDiscountType == nil {
		return nil
	}
	return &code
}

// RecordableAtPayment is whether a voucher can wait for the payment of an
// amount due: the pending selection keeps a voucher with a PRICE part, whose
// redemption the payment records, a COMPOSITE's other parts included (§9.10).
func RecordableAtPayment(voucher *catalogue.Voucher) bool {
	return voucher == nil || voucher.PriceDiscountType != nil
}

// VoucherInvalid is the checkout's one answer to a code it cannot apply.
func VoucherInvalid(operation string) error {
	return kaitenerrors.UnprocessableEntity(operation+".VoucherInvalid", "this voucher cannot be applied")
}

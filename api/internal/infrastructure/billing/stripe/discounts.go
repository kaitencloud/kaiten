package stripe

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/google/uuid"
	stripego "github.com/stripe/stripe-go/v87"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
)

// Discounts reach Stripe as one-off amount_off coupons, one per allocation of
// a DISCOUNT line, attached to the invoice item of the line they discount
// (CR-001): Stripe refuses a negative item on an invoice with automatic tax,
// and a coupon on the item is taxed on the discounted amount. The coupons
// are push artifacts of one invoice, never a mirror of Kaiten's vouchers.

// couponNameMax is Stripe's limit on a coupon's name.
const couponNameMax = 40

// CouponID is the coupon of one allocation: deterministic, so that it is
// idempotent beyond Stripe's 24-hour key horizon.
func CouponID(kaitenInvoiceID uuid.UUID, seq, targetSeq int) string {
	return "kt_" + strings.ReplaceAll(kaitenInvoiceID.String(), "-", "") + "_" + strconv.Itoa(seq) + "_" + strconv.Itoa(targetSeq)
}

// RecreatedCouponID is the coupon of an allocation given again to a line
// added again: Stripe keeps counting the removed item's redemption of the
// first coupon, which is redeemable once (measured: TestStripeSpike).
func RecreatedCouponID(kaitenInvoiceID uuid.UUID, seq, targetSeq, recreation int) string {
	id := CouponID(kaitenInvoiceID, seq, targetSeq)
	if recreation > 0 {
		id += "_r" + strconv.Itoa(recreation)
	}
	return id
}

// AddDiscount implements provider.Adapter: a coupon of the allocation's
// amount, once, redeemable once. A coupon already there under its id (the
// answer lost beyond the key horizon) is adopted when it is the same one, and
// refused as coupon_conflict otherwise.
func (a *Adapter) AddDiscount(ctx context.Context, ref provider.Ref, _ string, in provider.NormalizedInvoice, d provider.NormalizedDiscount) (string, error) {
	if d.AmountMinor <= 0 {
		return "", errors.New("stripe: refusing a discount that is not positive")
	}
	sc, _, err := a.connect(ref)
	if err != nil {
		return "", err
	}
	id := RecreatedCouponID(in.KaitenInvoiceID, d.Seq, d.TargetSeq, d.Recreation)
	currency := strings.ToLower(in.Currency)
	params := &stripego.CouponCreateParams{
		ID: stripego.String(id), AmountOff: stripego.Int64(d.AmountMinor), Currency: stripego.String(currency),
		Duration: stripego.String(string(stripego.CouponDurationOnce)), MaxRedemptions: stripego.Int64(1),
		Name: stripego.String(couponName(d.Label)),
		Metadata: map[string]string{
			"kaiten_invoice_id": in.KaitenInvoiceID.String(), "kaiten_line_id": d.LineID.String(),
			"kaiten_line_seq": strconv.Itoa(d.Seq), "kaiten_target_seq": strconv.Itoa(d.TargetSeq),
			"kaiten_voucher_id": d.VoucherID.String(),
		},
	}
	key := in.KaitenInvoiceID.String() + ":coupon:" + strconv.Itoa(d.Seq) + ":" + strconv.Itoa(d.TargetSeq)
	if d.Recreation > 0 {
		key += ":r" + strconv.Itoa(d.Recreation)
	}
	params.SetIdempotencyKey(key)
	created, err := sc.V1Coupons.Create(ctx, params)
	if err == nil {
		return created.ID, nil
	}
	if !alreadyExists(err) {
		return "", classify(err, objectNone)
	}
	existing, err := sc.V1Coupons.Retrieve(ctx, id, nil)
	if err != nil {
		return "", classify(err, objectNone)
	}
	if existing.AmountOff != d.AmountMinor || string(existing.Currency) != currency ||
		existing.Metadata["kaiten_invoice_id"] != in.KaitenInvoiceID.String() {
		return "", &provider.Error{
			Class: provider.ClassRejected, Code: "coupon_conflict", Param: "id", RequestID: "",
			Message: "Stripe coupon " + id + " exists with another amount, currency or invoice",
		}
	}
	return existing.ID, nil
}

// DeleteDiscount implements provider.Adapter. Deleting a coupon leaves the
// discounts already applied to a finalized invoice as they are; one already
// deleted is a success.
func (a *Adapter) DeleteDiscount(ctx context.Context, ref provider.Ref, externalDiscountID string) error {
	sc, _, err := a.connect(ref)
	if err != nil {
		return err
	}
	if _, err := sc.V1Coupons.Delete(ctx, externalDiscountID, nil); err != nil && !isMissing(err) {
		return classify(err, objectNone)
	}
	return nil
}

// DeleteLine implements provider.Adapter: the invoice item is deleted from
// the draft; one already gone is a success.
func (a *Adapter) DeleteLine(ctx context.Context, ref provider.Ref, _, externalLineID string) error {
	sc, _, err := a.connect(ref)
	if err != nil {
		return err
	}
	if _, err := sc.V1InvoiceItems.Delete(ctx, externalLineID, nil); err != nil && !isMissing(err) {
		return classify(err, objectInvoice)
	}
	return nil
}

func couponName(label string) string {
	runes := []rune(label)
	if len(runes) > couponNameMax {
		return string(runes[:couponNameMax-1]) + "…"
	}
	return label
}

// alreadyExists reports a create refused because the id is taken.
func alreadyExists(err error) bool {
	var stripeErr *stripego.Error
	return errors.As(err, &stripeErr) && stripeErr.Code == stripego.ErrorCodeResourceAlreadyExists
}

// lineDiscounts maps a line's discount amounts to the coupons they come
// from. discounts are the line's discounts, expanded; a discount amount
// whose discount is not among them keeps the discount's id.
func lineDiscounts(line *stripego.InvoiceLineItem) []provider.LineDiscount {
	coupons := map[string]string{}
	for _, d := range line.Discounts {
		if d != nil && d.Source != nil && d.Source.Coupon != nil {
			coupons[d.ID] = d.Source.Coupon.ID
		}
	}
	out := make([]provider.LineDiscount, 0, len(line.DiscountAmounts))
	for _, amount := range line.DiscountAmounts {
		if amount == nil || amount.Discount == nil {
			continue
		}
		id := amount.Discount.ID
		if coupon, ok := coupons[id]; ok {
			id = coupon
		} else if amount.Discount.Source != nil && amount.Discount.Source.Coupon != nil {
			id = amount.Discount.Source.Coupon.ID
		}
		out = append(out, provider.LineDiscount{Seq: 0, ExternalID: id, AmountMinor: amount.Amount})
	}
	return out
}

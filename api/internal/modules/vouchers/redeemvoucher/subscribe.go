package redeemvoucher

import "context"

// RedeemForSubscription redeems a voucher as part of a subscribe, inside its
// transaction, after its add-ons (§9.1 step 2.3): the eligibility rules that
// read the subscription -- annual only, minimum amount -- see the one being
// started, and a PRICE voucher applies from the ACTIVATION invoice composed
// next.
func (u *UseCase) RedeemForSubscription(ctx context.Context, instanceSlug, code string) error {
	_, err := u.Execute(ctx, instanceSlug, code)
	return err
}

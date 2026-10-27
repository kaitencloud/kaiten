package subscriptions

import "github.com/google/uuid"

// PendingSelection is what a public checkout with an amount due bought and
// did not apply yet (§9.10 rule 1, INV-33, §24 #65), stored as
// instance_billing.pending_selection until the ACTIVATION is paid: the
// add-ons and the voucher, with the ids their rows take then, which the
// ACTIVATION's lines already name.
type PendingSelection struct {
	// LicensePriceID is the price the payment makes the base, on a checkout
	// waiting over a free live subscription (§9.10 rule 6); an INCOMPLETE
	// row's is its base_license_price_id already.
	LicensePriceID *uuid.UUID      `json:"licensePriceId,omitempty"`
	AddOns         []PendingAddon  `json:"addOns"`
	Voucher        *PendingVoucher `json:"voucher"`
}

// PendingAddon is an add-on the payment attaches.
type PendingAddon struct {
	InstanceAddonID uuid.UUID `json:"instanceAddonId"`
	AddonID         uuid.UUID `json:"addonId"`
	AddonSlug       string    `json:"addonSlug"`
	Quantity        int32     `json:"quantity"`
}

// PendingVoucher is the voucher the payment redeems.
type PendingVoucher struct {
	InstanceVoucherID uuid.UUID `json:"instanceVoucherId"`
	VoucherID         uuid.UUID `json:"voucherId"`
	Code              string    `json:"code"`
}

// IncompleteLifetime is how long an INCOMPLETE checkout waits for its
// payment: anchor_at + 23 h, as Stripe's incomplete subscriptions (§9.10).
const IncompleteLifetime = 23 * 60 * 60 // seconds

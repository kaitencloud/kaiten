package ports

import (
	"context"

	"github.com/google/uuid"
)

// AddonAttacher attaches an add-on to an instance, inside the caller's
// transaction, under every rule of §10. Implemented by the add-ons module.
type AddonAttacher interface {
	AttachForSubscription(ctx context.Context, instanceSlug, addonSlug string, quantity int32) error
	// AttachPaid creates an attachment an INCOMPLETE checkout's payment
	// applies, under its pending id, never refused (§9.10 rule 3).
	AttachPaid(ctx context.Context, organizationID, actorID uuid.UUID, instanceSlug string, id uuid.UUID, addonSlug string, quantity int32) error
}

// VoucherRedeemer redeems a voucher for an instance, inside the caller's
// transaction, under every rule of §11. Implemented by the vouchers module.
type VoucherRedeemer interface {
	RedeemForSubscription(ctx context.Context, instanceSlug, code string) error
	// RedeemPaid records the redemption an INCOMPLETE checkout's payment
	// applies, under its pending id, never refused; whether a row was written.
	RedeemPaid(ctx context.Context, organizationID, actorID uuid.UUID, instanceSlug string, id uuid.UUID, code string) (bool, error)
}

// VoucherExpiry marks vouchers and redemptions past their dates EXPIRED, up
// to limit of each, for the billing-lifecycle job (§16.2 (b)). Implemented by
// the vouchers module.
type VoucherExpiry interface {
	Pass(ctx context.Context, limit int) (int, error)
}

// InstanceVersionMover pins an instance to another licence version, inside the
// caller's transaction, under the instance module's own rules. Implemented by
// the instances module.
type InstanceVersionMover interface {
	MoveToVersion(ctx context.Context, instanceSlug string, licenseID uuid.UUID) error
	// OverQuota is the entitlements whose current usage is above what the
	// instance accepts now, in the caller's transaction.
	OverQuota(ctx context.Context, instanceSlug string) ([]string, error)
}

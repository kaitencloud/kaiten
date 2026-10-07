package ports

import (
	"context"

	"github.com/google/uuid"
)

// AddonAttacher attaches an add-on to an instance, inside the caller's
// transaction, under every rule of §10. Implemented by the add-ons module.
type AddonAttacher interface {
	AttachForSubscription(ctx context.Context, instanceSlug, addonSlug string, quantity int32) error
}

// VoucherRedeemer redeems a voucher for an instance, inside the caller's
// transaction, under every rule of §11. Implemented by the vouchers module.
type VoucherRedeemer interface {
	RedeemForSubscription(ctx context.Context, instanceSlug, code string) error
}

// InstanceVersionMover pins an instance to another licence version, inside the
// caller's transaction, under the instance module's own rules. Implemented by
// the instances module.
type InstanceVersionMover interface {
	MoveToVersion(ctx context.Context, instanceSlug string, licenseID uuid.UUID) error
}

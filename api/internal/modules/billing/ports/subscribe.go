package ports

import (
	"context"
	"time"

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

// AddonFallback removes, inside the caller's transaction, the attachments a
// fallback move strands: those whose add-on version is not compatible with
// the family of licenseID, removed at the given instant by actorID, each announced (§9.11
// rule 3). Implemented by the add-ons module.
type AddonFallback interface {
	RemoveForFallback(ctx context.Context, organizationID, actorID uuid.UUID, instanceSlug string, licenseID uuid.UUID, at time.Time) error
}

// AddonSchedule applies, inside the caller's transaction, the public add-on
// decreases scheduled on an instance (§10.2, V31-67): at a boundary, after
// its composition read the quantities it bills, or at a cancellation, after
// which no boundary is left to wait for. Implemented by the add-ons module.
type AddonSchedule interface {
	ApplyScheduled(ctx context.Context, organizationID, actorID, instanceID uuid.UUID, at time.Time) error
	// ResetPeriodMax starts a period's highest quantities at the quantities
	// held, after a boundary was composed or a subscription started
	// (V31-70).
	ResetPeriodMax(ctx context.Context, organizationID, instanceID uuid.UUID) error
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

// ExceptionExpiry announces the entitlement exceptions whose end passed, up to
// limit, for the billing-lifecycle job (§16.2 (g)), billing enabled or not.
// Implemented by the entitlements module.
type ExceptionExpiry interface {
	Pass(ctx context.Context, limit int) (int, error)
}

// InstanceVersionMover pins an instance to another licence version, inside the
// caller's transaction, under the instance module's own rules. Implemented by
// the instances module.
type InstanceVersionMover interface {
	MoveToVersion(ctx context.Context, instanceSlug string, licenseID uuid.UUID) error
	// AnnounceUpdated records INSTANCE_UPDATED for a move billing made itself,
	// with the reason the event carries (nil, or BILLING_FALLBACK).
	AnnounceUpdated(ctx context.Context, organizationID uuid.UUID, instanceSlug string, reason *string) error
	// OverQuota is the entitlements whose current usage is above what the
	// instance accepts now, in the caller's transaction.
	OverQuota(ctx context.Context, instanceSlug string) ([]string, error)
}

// CheckoutFollower moves the anonymous checkout session an INCOMPLETE
// subscription came from along with it, inside the caller's transaction,
// after the subscription's rows (§9.12 rule 5): COMPLETED when its ACTIVATION
// is paid, EXPIRED when it ends unpaid. A subscription no session waits on is
// left alone. Implemented by the public SDK module.
type CheckoutFollower interface {
	Paid(ctx context.Context, organizationID, instanceID uuid.UUID) error
	Ended(ctx context.Context, organizationID, instanceID uuid.UUID) error
}

// CheckoutSweeper is the work on anonymous checkout sessions the billing jobs
// drive (§12.6 rule 4, §16.2): the sync backstop's completions, and
// billing-lifecycle steps (f) and (h). Implemented by the public SDK module.
type CheckoutSweeper interface {
	// Complete runs the completion of a session whose setup the provider
	// reported complete; one already applied changes nothing.
	Complete(ctx context.Context, organizationID, checkoutSessionID uuid.UUID) error
	// RetryCompleted retries the organization's OPEN sessions whose setup
	// completed, at most limit; the ones that failed.
	RetryCompleted(ctx context.Context, organizationID uuid.UUID, limit int) ([]uuid.UUID, error)
	// Abandon completes or reaps the sessions OPEN past their expiry (f).
	Abandon(ctx context.Context, limit int) (int, error)
	// Purge deletes the sessions closed longer ago than the retention (h).
	Purge(ctx context.Context, limit int) (int, error)
}

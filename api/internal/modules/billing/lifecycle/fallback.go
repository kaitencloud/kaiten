package lifecycle

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/telemetry"
)

// LicenseChangeBillingFallback is the licenseChangeReason INSTANCE_UPDATED
// carries for a fallback move (§15.1).
const LicenseChangeBillingFallback = "BILLING_FALLBACK"

// Why a fallback move was skipped, as kaiten.billing.fallback.skipped
// labels it (§9.11 rule 6).
const (
	FallbackNotFree          = "NOT_FREE"
	FallbackNoDefaultVersion = "NO_DEFAULT_VERSION"
)

// Fallback is what a fallback move writes outside billing: the stranded
// attachments, and INSTANCE_UPDATED. A nil one writes none of it.
type Fallback struct {
	Mover  ports.InstanceVersionMover
	Addons ports.AddonFallback
}

// Move is the fallback move of §9.11, in the transaction that made canceled
// CANCELED, after its instance.billing.canceled: when the family of the
// instance's licence names a fallback, the instance moves to the fallback
// family's default PUBLISHED version under the freeze escape, the
// attachments that version's family is not compatible with are removed at
// the cancellation instant, and INSTANCE_UPDATED says BILLING_FALLBACK. Only
// license_id changes (D-13). A fallback no longer FREE, or without a default
// PUBLISHED version, is skipped with a warning and the cancellation commits;
// a subscription whose instance is gone moves nothing. Never called for a
// subscription leaving INCOMPLETE or a free one a checkout replaces (INV-24).
func (f Fallback) Move(ctx context.Context, q *db.Queries, canceled db.InstanceBilling, actor uuid.UUID) error {
	if canceled.InstanceID == nil {
		return nil
	}
	target, err := q.GetFallbackTarget(ctx, db.GetFallbackTargetParams{OrganizationID: canceled.OrganizationID, InstanceID: *canceled.InstanceID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	switch {
	case target.Free == nil || !*target.Free:
		return skipFallback(ctx, canceled, FallbackNotFree)
	case target.LicenseID == nil:
		return skipFallback(ctx, canceled, FallbackNoDefaultVersion)
	}
	if err := q.AllowPlanChange(ctx); err != nil {
		return err
	}
	if err := q.MoveInstanceToLicense(ctx, db.MoveInstanceToLicenseParams{
		LicenseID: *target.LicenseID, Now: canceled.UpdatedAt, ID: *canceled.InstanceID,
	}); err != nil {
		return err
	}
	if f.Mover != nil {
		reason := LicenseChangeBillingFallback
		if err := f.Mover.AnnounceUpdated(ctx, canceled.OrganizationID, target.InstanceSlug, &reason); err != nil {
			return err
		}
	}
	if f.Addons != nil && canceled.CanceledAt.Valid {
		return f.Addons.RemoveForFallback(ctx, canceled.OrganizationID, actor, target.InstanceSlug, *target.LicenseID, canceled.CanceledAt.Time)
	}
	return nil
}

func skipFallback(ctx context.Context, canceled db.InstanceBilling, reason string) error {
	slog.WarnContext(ctx, "fallback move skipped: the instance keeps its licence",
		"instance_billing_id", canceled.ID, "instance_slug", canceled.InstanceSlug, "reason", reason)
	telemetry.FallbackSkipped(ctx, reason)
	return nil
}

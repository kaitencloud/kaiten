package catalogue

import (
	"context"
	"errors"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

// CheckDraftOperational preflights the whole requested batch before any write.
// Updates reconstruct preserved hidden grants first and may echo those unchanged;
// creates pass no preserved slugs and cannot introduce AI relations.
func CheckDraftOperational(ctx context.Context, q *db.Queries, org uuid.UUID, policy aiusage.Policy, draft VoucherDraft, preserved []string, oldLicensePrices, oldAddonPrices []uuid.UUID) error {
	ctx = policy.ForOrganization(ctx, org)
	if policy.Enabled(ctx) {
		return nil
	}
	for _, grant := range draft.Grants {
		target, err := q.GetBoostableEntitlement(ctx, db.GetBoostableEntitlementParams{OrganizationID: org, Slug: grant.EntitlementSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		if string(target.Type) == "NUMBER_AI_CREDIT" && !slices.Contains(preserved, grant.EntitlementSlug) {
			return policy.RequireEnabled(ctx)
		}
	}
	refs, err := q.VoucherAIPriceReferences(ctx, db.VoucherAIPriceReferencesParams{OrganizationID: org, LicensePriceIds: draft.ApplicableLicensePriceIDs, AddonPriceIds: draft.ApplicableAddonPriceIDs})
	if err != nil {
		return err
	}
	for _, ref := range refs {
		old := oldLicensePrices
		if ref.Addon {
			old = oldAddonPrices
		}
		if !slices.Contains(old, ref.ID) {
			return policy.RequireEnabled(ctx)
		}
	}
	return nil
}

func RequireOperational(ctx context.Context, q *db.Queries, org, id uuid.UUID, policy aiusage.Policy) error {
	ctx = policy.ForOrganization(ctx, org)
	if policy.Enabled(ctx) {
		return nil
	}
	voucher, err := One(ctx, q, org, &id, nil, false, nil)
	if err != nil {
		return err
	}
	for _, grant := range voucher.Grants {
		if err := policy.RequireType(ctx, grant.EntitlementType); err != nil {
			return err
		}
	}
	return CheckDraftOperational(ctx, q, org, policy, VoucherDraft{ApplicableLicensePriceIDs: voucher.ApplicableLicensePriceIDs, ApplicableAddonPriceIDs: voucher.ApplicableAddonPriceIDs}, nil, nil, nil)
}

// VisibleVoucher projects relations only. Canonical mutation/billing reads are
// never replaced by this view, and immutable events remain canonical.
func VisibleVoucher(ctx context.Context, q *db.Queries, org uuid.UUID, policy aiusage.Policy, voucher Voucher) (Voucher, error) {
	ctx = policy.ForOrganization(ctx, org)
	if policy.Enabled(ctx) {
		return voucher, nil
	}
	visible := make([]Grant, 0, len(voucher.Grants))
	for _, grant := range voucher.Grants {
		if policy.RequireType(ctx, grant.EntitlementType) == nil {
			visible = append(visible, grant)
		}
	}
	voucher.Grants = visible
	refs, err := q.VoucherAIPriceReferences(ctx, db.VoucherAIPriceReferencesParams{OrganizationID: org, LicensePriceIds: voucher.ApplicableLicensePriceIDs, AddonPriceIds: voucher.ApplicableAddonPriceIDs})
	if err != nil {
		return Voucher{}, err
	}
	voucher.ApplicableLicensePriceIDs = slices.Clone(voucher.ApplicableLicensePriceIDs)
	voucher.ApplicableAddonPriceIDs = slices.Clone(voucher.ApplicableAddonPriceIDs)
	for _, ref := range refs {
		if ref.Addon {
			voucher.ApplicableAddonPriceIDs = slices.DeleteFunc(voucher.ApplicableAddonPriceIDs, func(id uuid.UUID) bool { return id == ref.ID })
		} else {
			voucher.ApplicableLicensePriceIDs = slices.DeleteFunc(voucher.ApplicableLicensePriceIDs, func(id uuid.UUID) bool { return id == ref.ID })
		}
	}
	return voucher, nil
}

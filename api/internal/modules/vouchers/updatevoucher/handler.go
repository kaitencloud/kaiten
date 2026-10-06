package updatevoucher

import (
	"context"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "UpdateVoucher"

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute replaces a DRAFT voucher, or the four members an ACTIVE one takes.
func (u *UseCase) Execute(ctx context.Context, voucherID uuid.UUID, draft catalogue.VoucherDraft) (*catalogue.Voucher, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var updated catalogue.Voucher
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		locked, err := catalogue.Lock(ctx, q, user.OrganizationID, voucherID, operation)
		if err != nil {
			return err
		}
		stored, err := catalogue.One(ctx, q, user.OrganizationID, &voucherID, nil, true, nil)
		if err != nil {
			return err
		}
		if draft.VoucherType != stored.VoucherType {
			return kaitenerrors.Conflict(operation+".NotEditable", "a voucher's type never changes")
		}
		if draft.Code == nil {
			draft.Code = stored.Code
		}
		switch locked.Status {
		case db.VoucherStatusDRAFT:
		case db.VoucherStatusACTIVE:
			if !onlyActiveMembersChange(stored, draft) {
				return kaitenerrors.Conflict(operation+".NotEditable",
					"an active voucher takes a new name, description, expiresAt and maxRedemptions only")
			}
			if draft.MaxRedemptions != nil && *draft.MaxRedemptions < locked.RedemptionsCount {
				return kaitenerrors.Conflict(operation+".MaxRedemptionsBelowCount", "maxRedemptions is below the redemptions already made")
			}
		default:
			return kaitenerrors.Conflict(operation+".NotEditable", "only a DRAFT or ACTIVE voucher can be changed")
		}
		resolved, err := draft.Resolve(ctx, q, operation, user.OrganizationID, user.ID)
		if err != nil {
			return err
		}
		p := resolved.Params
		err = q.UpdateVoucher(ctx, db.UpdateVoucherParams{
			Code: p.Code, Name: p.Name, Description: p.Description, Duration: p.Duration, DurationInPeriods: p.DurationInPeriods,
			MaxRedemptions: p.MaxRedemptions, StartsAt: p.StartsAt, ExpiresAt: p.ExpiresAt, PriceDiscountType: p.PriceDiscountType,
			PriceDiscountValue: p.PriceDiscountValue, Currency: p.Currency, PriceAppliesTo: p.PriceAppliesTo,
			ApplicableLicensePriceIds: p.ApplicableLicensePriceIds, ApplicableAddonPriceIds: p.ApplicableAddonPriceIds,
			ApplicableLicenseIds: p.ApplicableLicenseIds, ApplicableAddonIds: p.ApplicableAddonIds,
			RestrictedCustomerID: p.RestrictedCustomerID, RedemptionRules: p.RedemptionRules, UserID: user.ID,
			OrganizationID: user.OrganizationID, ID: voucherID,
		})
		if kaitenerrors.IsUniqueViolationOnConstraint(err, "voucher_organization_id_code_normalized_key") {
			return kaitenerrors.Conflict(operation+".CodeConflict", "another voucher has this code, compared without case or separators")
		}
		if kaitenerrors.IsCheckViolationOnConstraint(err, "voucher_redemptions_check") {
			return kaitenerrors.Conflict(operation+".MaxRedemptionsBelowCount", "maxRedemptions is below the redemptions already made")
		}
		if err != nil {
			return err
		}
		if locked.Status == db.VoucherStatusDRAFT {
			if err := catalogue.WriteGrants(ctx, q, operation, user.OrganizationID, voucherID, draft.Grants, resolved.Entitlements); err != nil {
				return err
			}
		}
		updated, err = catalogue.One(ctx, q, user.OrganizationID, &voucherID, nil, true, nil)
		if err != nil {
			return err
		}
		return catalogue.Announce(ctx, u.outbox, user.OrganizationID, events.VoucherUpdated, updated)
	})
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

// onlyActiveMembersChange reports whether a draft changes nothing an active
// voucher keeps: its code, discount, applicability, grants, rules, duration
// and start.
func onlyActiveMembersChange(stored catalogue.Voucher, d catalogue.VoucherDraft) bool {
	same := func(a, b *string) bool { return (a == nil && b == nil) || (a != nil && b != nil && *a == *b) }
	sameInt := func(a, b *int32) bool { return (a == nil && b == nil) || (a != nil && b != nil && *a == *b) }
	sameTime := func(a, b *time.Time) bool { return (a == nil && b == nil) || (a != nil && b != nil && a.Equal(*b)) }
	sameIDs := func(a, b []uuid.UUID) bool {
		if len(a) != len(b) {
			return false
		}
		for _, id := range b {
			if !slices.Contains(a, id) {
				return false
			}
		}
		return true
	}
	if len(stored.Grants) != len(d.Grants) {
		return false
	}
	for i := range d.Grants {
		if !slices.ContainsFunc(stored.Grants, func(g catalogue.Grant) bool {
			return g.EntitlementSlug == d.Grants[i].EntitlementSlug && g.ModifierType == d.Grants[i].ModifierType
		}) {
			return false
		}
	}
	return same(stored.Code, d.Code) && stored.Duration == d.Duration && sameInt(stored.DurationInPeriods, d.DurationInPeriods) &&
		sameTime(stored.StartsAt, d.StartsAt) && same(stored.PriceDiscountType, d.PriceDiscountType) &&
		same(stored.PriceDiscountValue, d.PriceDiscountValue) && same(stored.Currency, d.Currency) &&
		same(stored.PriceAppliesTo, d.PriceAppliesTo) && same(stored.RestrictedCustomerSlug, d.RestrictedCustomerSlug) &&
		sameIDs(stored.ApplicableLicensePriceIDs, d.ApplicableLicensePriceIDs) &&
		sameIDs(stored.ApplicableAddonPriceIDs, d.ApplicableAddonPriceIDs) &&
		sameIDs(stored.ApplicableLicenseIDs, d.ApplicableLicenseIDs) && sameIDs(stored.ApplicableAddonIDs, d.ApplicableAddonIDs) &&
		stored.RedemptionRules.FirstTimeOnly == d.RedemptionRules.FirstTimeOnly &&
		stored.RedemptionRules.AnnualOnly == d.RedemptionRules.AnnualOnly
}

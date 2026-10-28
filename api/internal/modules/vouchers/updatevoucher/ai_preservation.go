package updatevoucher

import (
	"context"
	"time"

	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

// Unchanged hidden relation rows are insufficient if their shared operational
// window, eligibility or discount changes. Descriptive edits and independent
// ordinary grants/flag grants remain allowed.
func requireUnchangedAIBehavior(stored catalogue.Voucher, draft catalogue.VoucherDraft, hiddenGrants, hiddenPrices bool) error {
	if !hiddenGrants && !hiddenPrices {
		return nil
	}
	comparison := draft
	// A missing code is keep-current in the ordinary PUT contract. The handler
	// resolves it before preflight; retain that semantics in this pure guard too.
	if comparison.Code == nil {
		comparison.Code = stored.Code
	}
	comparison.Grants = stored.Grants
	comparison.FlagGrants = stored.FlagGrants
	// Ordinary selected prices are an independent part. Hidden IDs have already
	// been reconstructed and new AI references are preflighted separately.
	comparison.ApplicableLicensePriceIDs = stored.ApplicableLicensePriceIDs
	comparison.ApplicableAddonPriceIDs = stored.ApplicableAddonPriceIDs
	if stored.PriceDiscountValue != nil && draft.PriceDiscountValue != nil {
		old, e1 := decimal.NewFromString(*stored.PriceDiscountValue)
		requested, e2 := decimal.NewFromString(*draft.PriceDiscountValue)
		if e1 == nil && e2 == nil && old.Equal(requested) {
			comparison.PriceDiscountValue = stored.PriceDiscountValue
		}
	}
	if !hiddenPrices {
		comparison.PriceDiscountType = stored.PriceDiscountType
		comparison.PriceDiscountValue = stored.PriceDiscountValue
		comparison.Currency = stored.Currency
		comparison.PriceAppliesTo = stored.PriceAppliesTo
	}
	sameTime := func(a, b *time.Time) bool { return a == nil && b == nil || a != nil && b != nil && a.Equal(*b) }
	sameCount := stored.MaxRedemptions == nil && draft.MaxRedemptions == nil || stored.MaxRedemptions != nil && draft.MaxRedemptions != nil && *stored.MaxRedemptions == *draft.MaxRedemptions
	if !onlyActiveMembersChange(stored, comparison) || !sameTime(stored.ExpiresAt, draft.ExpiresAt) || !sameCount {
		return (aiusage.Policy{}).RequireEnabled(context.Background())
	}
	return nil
}

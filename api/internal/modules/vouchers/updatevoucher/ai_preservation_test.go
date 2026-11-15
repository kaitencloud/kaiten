package updatevoucher

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestHiddenAIRelationsDoNotAuthorizeSharedBehaviorChanges(t *testing.T) {
	t.Parallel()
	count := int32(10)
	end := time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)
	stored := catalogue.Voucher{VoucherType: catalogue.TypeComposite, Duration: catalogue.DurationForever, MaxRedemptions: &count, ExpiresAt: &end}
	original := catalogue.VoucherDraft{VoucherType: stored.VoucherType, Duration: stored.Duration, MaxRedemptions: stored.MaxRedemptions, ExpiresAt: stored.ExpiresAt}
	require.NoError(t, requireUnchangedAIBehavior(stored, original, true, false))
	for _, change := range []func(*catalogue.VoucherDraft){
		func(d *catalogue.VoucherDraft) { d.Duration = catalogue.DurationOnce },
		func(d *catalogue.VoucherDraft) { d.ExpiresAt = nil },
		func(d *catalogue.VoucherDraft) { d.MaxRedemptions = nil },
		func(d *catalogue.VoucherDraft) { d.RedemptionRules.FirstTimeOnly = true },
	} {
		draft := original
		change(&draft)
		require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(requireUnchangedAIBehavior(stored, draft, true, false)))
		require.NoError(t, requireUnchangedAIBehavior(stored, draft, false, false), "ordinary-only vouchers retain original edits")
	}
	descriptive := original
	descriptive.Name = "Ordinary rename"
	descriptive.Description = new("Description changed")
	descriptive.Grants = []catalogue.Grant{{EntitlementSlug: "ordinary", ModifierType: "UNLIMITED"}}
	require.NoError(t, requireUnchangedAIBehavior(stored, descriptive, true, false))
}

func TestHiddenAIPreservationKeepsOmittedOrEchoedVoucherCode(t *testing.T) {
	code := "EXISTING-VOUCHER-CODE"
	stored := catalogue.Voucher{Code: &code, VoucherType: catalogue.TypeComposite, Duration: catalogue.DurationForever}
	for _, requested := range []*string{nil, &code} {
		draft := catalogue.VoucherDraft{Code: requested, Name: "Ordinary rename", Description: new("Ordinary description"), VoucherType: stored.VoucherType, Duration: stored.Duration}
		require.NoError(t, requireUnchangedAIBehavior(stored, draft, true, false))
	}
	changed := "DIFFERENT-VOUCHER-CODE"
	draft := catalogue.VoucherDraft{Code: &changed, VoucherType: stored.VoucherType, Duration: stored.Duration}
	require.Equal(t, "AIUsage.Disabled", apierrors.GetCode(requireUnchangedAIBehavior(stored, draft, true, false)))
}

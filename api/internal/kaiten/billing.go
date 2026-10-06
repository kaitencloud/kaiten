package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updatebillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
)

// Billing is the billing module's operations: subscriptions, the invoices they
// produce, and the organization's billing defaults. Every one of them is behind
// the billing switch.
//
// See Customers for the naming and argument-order convention.
type Billing struct {
	uc *billing.UseCases
}

// Billing returns the billing surface.
func (k *Kaiten) Billing() Billing {
	return Billing{uc: k.modules.Billing}
}

func (b Billing) GetSettings(ctx context.Context, cl caller.OrganizationCaller) (*settings.BillingSettings, error) {
	if err := cl.Require(getbillingsettings.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.GetBillingSettings.Execute(bindOrganization(ctx, cl))
}

func (b Billing) UpdateSettings(
	ctx context.Context, cl caller.OrganizationCaller, next settings.BillingSettings,
) (*settings.BillingSettings, error) {
	if err := cl.Require(updatebillingsettings.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.UpdateBillingSettings.Execute(bindOrganization(ctx, cl), next)
}

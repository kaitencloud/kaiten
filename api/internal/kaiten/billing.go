package kaiten

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinstancebilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
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

// Subscribe starts billing an instance, or bills a CANCELED one again.
func (b Billing) Subscribe(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, cmd subscribeinstance.Command,
) (*subscribeinstance.StartedSubscription, error) {
	if err := cl.Require(subscribeinstance.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.SubscribeInstance.Execute(bindOrganization(ctx, cl), instanceSlug, cmd)
}

func (b Billing) GetInstanceBilling(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug string,
) (*subscriptions.InstanceBilling, error) {
	if err := cl.Require(getinstancebilling.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.GetInstanceBilling.Execute(bindOrganization(ctx, cl), instanceSlug)
}

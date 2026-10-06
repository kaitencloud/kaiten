package kaiten

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closebillingperiods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinstancebilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getupcominginvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoicelist"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinstanceinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updatebillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/platform/caller"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
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

// CloseBillingPeriods closes the organization's due subscriptions now.
func (b Billing) CloseBillingPeriods(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug *string,
) (*closing.Report, error) {
	if err := cl.Require(closebillingperiods.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.CloseBillingPeriods.Execute(bindOrganization(ctx, cl), instanceSlug)
}

func (b Billing) ListInvoices(
	ctx context.Context, cl caller.OrganizationCaller, params invoicelist.Params, instanceSlug string,
) (pagination.Page[invoices.InvoiceSummary], error) {
	if err := cl.Require(listinvoices.RequiredScope); err != nil {
		return pagination.Page[invoices.InvoiceSummary]{}, err
	}

	return b.uc.ListInvoices.Execute(bindOrganization(ctx, cl), params, instanceSlug)
}

func (b Billing) ListInstanceInvoices(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, params invoicelist.Params,
) (pagination.Page[invoices.InvoiceSummary], error) {
	if err := cl.Require(listinstanceinvoices.RequiredScope); err != nil {
		return pagination.Page[invoices.InvoiceSummary]{}, err
	}

	return b.uc.ListInstanceInvoices.Execute(bindOrganization(ctx, cl), instanceSlug, params)
}

func (b Billing) GetInvoice(ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID) (*invoices.Invoice, error) {
	if err := cl.Require(getinvoice.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.GetInvoice.Execute(bindOrganization(ctx, cl), invoiceID)
}

// GetUpcomingInvoice previews what the subscription's next boundary will
// issue.
func (b Billing) GetUpcomingInvoice(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug string,
) (*rating.InvoicePreview, error) {
	if err := cl.Require(getupcominginvoice.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.GetUpcomingInvoice.Execute(bindOrganization(ctx, cl), instanceSlug)
}

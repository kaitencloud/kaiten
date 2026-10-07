package kaiten

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ackhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/cancelplanchange"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/cancelsubscription"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/claimhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closebillingperiods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/completepaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createportalsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/detachpaymentmethod"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/exportinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingcapabilities"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillinghealth"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getcustomerbilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinstancebilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getupcominginvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoicelist"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listhandoff"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinstanceinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinvoicelinereports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/listinvoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/markinvoicepaid"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/reactivatesubscription"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/recomposeinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/releaseinvoicehold"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/retryinvoicepush"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/scheduleplanchange"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/syncinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/syncprovider"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updatebillingsettings"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/updateinstancebilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/voidinvoice"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/writeoffinvoice"
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

// MarkInvoicePaid records a payment of an invoice the organization collects.
func (b Billing) MarkInvoicePaid(
	ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID, cmd markinvoicepaid.Command,
) (*invoices.Invoice, error) {
	if err := cl.Require(markinvoicepaid.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.MarkInvoicePaid.Execute(bindOrganization(ctx, cl), invoiceID, cmd)
}

func (b Billing) WriteOffInvoice(
	ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID, reason string,
) (*invoices.Invoice, error) {
	if err := cl.Require(writeoffinvoice.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.WriteOffInvoice.Execute(bindOrganization(ctx, cl), invoiceID, reason)
}

func (b Billing) VoidInvoice(
	ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID, reason string,
) (*invoices.Invoice, error) {
	if err := cl.Require(voidinvoice.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.VoidInvoice.Execute(bindOrganization(ctx, cl), invoiceID, reason)
}

func (b Billing) ReleaseInvoiceHold(
	ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID, reason string,
) (*invoices.Invoice, error) {
	if err := cl.Require(releaseinvoicehold.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.ReleaseInvoiceHold.Execute(bindOrganization(ctx, cl), invoiceID, reason)
}

func (b Billing) RecomposeInvoice(
	ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID,
) (*recomposeinvoice.Result, error) {
	if err := cl.Require(recomposeinvoice.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.RecomposeInvoice.Execute(bindOrganization(ctx, cl), invoiceID)
}

// ListHandoff reads the handoff queue without leasing anything.
func (b Billing) ListHandoff(
	ctx context.Context, cl caller.OrganizationCaller, status, cursor string, limit int32,
) (pagination.Page[listhandoff.QueuedInvoice], error) {
	if err := cl.Require(listhandoff.RequiredScope); err != nil {
		return pagination.Page[listhandoff.QueuedInvoice]{}, err
	}

	return b.uc.ListHandoff.Execute(bindOrganization(ctx, cl), status, cursor, limit)
}

// ClaimHandoff leases invoices waiting for the organization's accounting
// system.
func (b Billing) ClaimHandoff(
	ctx context.Context, cl caller.OrganizationCaller, limit, leaseSeconds int32,
) (*claimhandoff.HandoffClaim, error) {
	if err := cl.Require(claimhandoff.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.ClaimHandoff.Execute(bindOrganization(ctx, cl), limit, leaseSeconds)
}

func (b Billing) AckHandoff(
	ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID, cmd ackhandoff.Command,
) (*invoices.Invoice, error) {
	if err := cl.Require(ackhandoff.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.AckHandoff.Execute(bindOrganization(ctx, cl), invoiceID, cmd)
}

// ExportInvoices checks an export request; the export reads as it streams.
func (b Billing) ExportInvoices(
	ctx context.Context, cl caller.OrganizationCaller, params invoicelist.Params, instanceSlug, format, granularity string,
) (*exportinvoices.Export, error) {
	if err := cl.Require(exportinvoices.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.ExportInvoices.Execute(bindOrganization(ctx, cl), params, instanceSlug, format, granularity)
}

// ListInvoiceLineReports reads the usage reports a metered line was measured
// from.
func (b Billing) ListInvoiceLineReports(
	ctx context.Context, cl caller.OrganizationCaller, invoiceID, lineID uuid.UUID, q listinvoicelinereports.Query,
) (*listinvoicelinereports.Answer, error) {
	if err := cl.Require(listinvoicelinereports.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.ListInvoiceLineReports.Execute(bindOrganization(ctx, cl), invoiceID, lineID, q)
}

// GetCapabilities answers what billing can do for the organization, enabled
// or not.
func (b Billing) GetCapabilities(ctx context.Context, cl caller.OrganizationCaller) (*getbillingcapabilities.BillingCapabilities, error) {
	if err := cl.Require(getbillingcapabilities.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.GetBillingCapabilities.Execute(bindOrganization(ctx, cl))
}

// CancelSubscription cancels at the period's end, or now with a FINAL invoice.
func (b Billing) CancelSubscription(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug, mode string, reason *string,
) (*cancelsubscription.CanceledSubscription, error) {
	if err := cl.Require(cancelsubscription.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.CancelSubscription.Execute(bindOrganization(ctx, cl), instanceSlug, mode, reason)
}

func (b Billing) ReactivateSubscription(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug string,
) (*subscriptions.InstanceBilling, error) {
	if err := cl.Require(reactivatesubscription.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.ReactivateSubscription.Execute(bindOrganization(ctx, cl), instanceSlug)
}

func (b Billing) SchedulePlanChange(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, priceID uuid.UUID,
) (*subscriptions.InstanceBilling, error) {
	if err := cl.Require(scheduleplanchange.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.SchedulePlanChange.Execute(bindOrganization(ctx, cl), instanceSlug, priceID)
}

func (b Billing) CancelPlanChange(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug string,
) (*subscriptions.InstanceBilling, error) {
	if err := cl.Require(cancelplanchange.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.CancelPlanChange.Execute(bindOrganization(ctx, cl), instanceSlug)
}

func (b Billing) UpdateInstanceBilling(
	ctx context.Context, cl caller.OrganizationCaller, instanceSlug string, cmd updateinstancebilling.Command,
) (*subscriptions.InstanceBilling, error) {
	if err := cl.Require(updateinstancebilling.RequiredScope); err != nil {
		return nil, err
	}

	return b.uc.UpdateInstanceBilling.Execute(bindOrganization(ctx, cl), instanceSlug, cmd)
}

func (b Billing) RetryInvoicePush(ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID) (*invoices.Invoice, error) {
	if err := cl.Require(retryinvoicepush.RequiredScope); err != nil {
		return nil, err
	}
	return b.uc.RetryInvoicePush.Execute(bindOrganization(ctx, cl), invoiceID)
}

func (b Billing) SyncProvider(ctx context.Context, cl caller.OrganizationCaller) (*syncprovider.SyncReport, error) {
	if err := cl.Require(syncprovider.RequiredScope); err != nil {
		return nil, err
	}
	return b.uc.SyncProvider.Execute(bindOrganization(ctx, cl))
}

func (b Billing) SyncInvoice(ctx context.Context, cl caller.OrganizationCaller, invoiceID uuid.UUID) (*invoices.Invoice, error) {
	if err := cl.Require(syncinvoice.RequiredScope); err != nil {
		return nil, err
	}
	return b.uc.SyncInvoice.Execute(bindOrganization(ctx, cl), invoiceID)
}

func (b Billing) GetHealth(ctx context.Context, cl caller.OrganizationCaller) (*getbillinghealth.BillingHealth, error) {
	if err := cl.Require(getbillinghealth.RequiredScope); err != nil {
		return nil, err
	}
	return b.uc.GetBillingHealth.Execute(bindOrganization(ctx, cl))
}

// GetCustomerBilling reads a customer's side in each payment provider.
func (b Billing) GetCustomerBilling(ctx context.Context, cl caller.OrganizationCaller, customerSlug string) (*getcustomerbilling.CustomerBilling, error) {
	if err := cl.Require(getcustomerbilling.RequiredScope); err != nil {
		return nil, err
	}
	return b.uc.GetCustomerBilling.Execute(bindOrganization(ctx, cl), customerSlug)
}

// CreatePaymentMethodSession opens a page saving a customer's payment method.
func (b Billing) CreatePaymentMethodSession(ctx context.Context, cl caller.OrganizationCaller, customerSlug string, cmd createpaymentmethodsession.NewPaymentMethodSession) (*createpaymentmethodsession.PaymentMethodSession, error) {
	if err := cl.Require(createpaymentmethodsession.RequiredScope); err != nil {
		return nil, err
	}
	return b.uc.CreatePaymentMethodSession.Execute(bindOrganization(ctx, cl), customerSlug, cmd)
}

// CompletePaymentMethodSession applies a setup page the customer finished.
func (b Billing) CompletePaymentMethodSession(ctx context.Context, cl caller.OrganizationCaller, customerSlug, sessionID string) (*completepaymentmethodsession.CompletedPaymentMethodSession, error) {
	if err := cl.Require(completepaymentmethodsession.RequiredScope); err != nil {
		return nil, err
	}
	return b.uc.CompletePaymentMethodSession.Execute(bindOrganization(ctx, cl), customerSlug, sessionID)
}

// CreatePortalSession opens a customer's billing portal in its provider.
func (b Billing) CreatePortalSession(ctx context.Context, cl caller.OrganizationCaller, customerSlug string, cmd createportalsession.NewPortalSession) (*createportalsession.PortalSession, error) {
	if err := cl.Require(createportalsession.RequiredScope); err != nil {
		return nil, err
	}
	return b.uc.CreatePortalSession.Execute(bindOrganization(ctx, cl), customerSlug, cmd)
}

// DetachPaymentMethod removes a customer's payment method from its provider.
func (b Billing) DetachPaymentMethod(ctx context.Context, cl caller.OrganizationCaller, customerSlug string) error {
	if err := cl.Require(detachpaymentmethod.RequiredScope); err != nil {
		return err
	}
	return b.uc.DetachPaymentMethod.Execute(bindOrganization(ctx, cl), customerSlug)
}

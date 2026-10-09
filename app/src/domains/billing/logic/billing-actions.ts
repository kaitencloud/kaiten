import {
  type ApiOperationId,
  OPERATION_SCOPES,
} from '@/lib/api/operation-scopes.gen';
import type { ApiScope } from '@/lib/api/scopes.gen';
import { type GrantedScopes, hasScope } from '@/lib/granted-scopes';

/**
 * Every action a billing screen offers, with the operation it calls. The scope
 * an action needs is not written here: it is the one the contract gives that
 * operation (`OPERATION_SCOPES`, generated from the `security` of
 * `app/openapi.yaml`), so a scope the API renames is a type error, and no screen
 * repeats a scope string.
 *
 * An action is listed when a screen of the console offers it; one that is not
 * offered anywhere (the handoff claim, the close of the periods, which a CLI and
 * a job make) has no entry. A screen asks `canPerformAction` with the scopes of
 * the session and hides what the API would refuse.
 */
export const BILLING_ACTIONS = {
  // The capabilities every billing screen gates on.
  'capabilities.read': 'getBillingCapabilities',
  // The version's prices and the invoice preview (scopes of the licenses).
  'licensePrices.read': 'listLicensePrices',
  'licensePrices.preview': 'previewLicenseInvoice',
  'licensePrices.create': 'createLicensePrice',
  'licensePrices.update': 'updateLicensePrice',
  'licensePrices.deprecate': 'deprecateLicensePrice',
  'license.updateCommercialFields': 'updateLicense',
  // A new version, which is what changes a version that can no longer change.
  'license.createVersion': 'createLicense',
  // An instance's subscription.
  'subscription.read': 'getInstanceBilling',
  'subscription.subscribe': 'subscribeInstance',
  'subscription.upcomingInvoice': 'getUpcomingInvoice',
  'subscription.invoices': 'listInstanceInvoices',
  // Its life: ending it, taking the ending back, moving it to another plan at the
  // next boundary, and the terms its invoices are issued on.
  'subscription.cancel': 'cancelSubscription',
  'subscription.reactivate': 'reactivateSubscription',
  'subscription.schedulePlanChange': 'schedulePlanChange',
  'subscription.cancelPlanChange': 'cancelPlanChange',
  'subscription.updateTerms': 'updateInstanceBilling',
  // The add-ons an instance holds. The scopes are the instance's: an attachment is
  // entitlement state of the instance, like its license, and not the catalogue's.
  // A cancellation offers to detach them beside it.
  'instance.addons.list': 'listInstanceAddons',
  'instance.addons.attach': 'attachInstanceAddon',
  'instance.addons.setQuantity': 'setInstanceAddonQuantity',
  'instance.addons.detach': 'detachInstanceAddon',
  'instance.update': 'updateInstance',
  // Every instance, read to find who holds an add-on version.
  'instances.list': 'getInstances',
  // The customers, and the license versions, a voucher can be reserved for or limited to.
  'customers.list': 'listCustomers',
  'licenses.list': 'getLicenses',
  // Listing a family of licenses in the public catalogue.
  'licenseFamily.setPublic': 'updateLicenseFamily',
  // The families a license is sold in, and what a version of one grants: what the
  // screens of the add-ons read to say which licenses an add-on fits.
  'licenseFamilies.list': 'listLicenseFamilies',
  'licenseGrants.list': 'getLicenseEntitlements',
  // The entitlements an add-on version can be given.
  'entitlements.list': 'listEntitlements',
  // The add-on catalogue: families, versions and their lifecycle (scopes of the add-ons).
  'addons.list': 'listAddonFamilies',
  'addons.read': 'listAddons',
  'addons.create': 'createAddon',
  'addons.update': 'updateAddon',
  'addons.delete': 'deleteAddon',
  'addons.publish': 'publishAddon',
  'addons.archive': 'archiveAddon',
  'addons.unarchive': 'unarchiveAddon',
  'addonFamily.setPublic': 'updateAddonFamily',
  // What a version grants, what it is sold for and which licenses it fits.
  'addonGrants.assign': 'assignAddonEntitlement',
  'addonGrants.update': 'updateAddonEntitlement',
  'addonGrants.unassign': 'unassignAddonEntitlement',
  'addonPrices.create': 'createAddonPrice',
  'addonPrices.deprecate': 'deprecateAddonPrice',
  'addonCompatibility.list': 'listAddonCompatibility',
  'addonCompatibility.set': 'setAddonCompatibility',
  'addonCompatibility.remove': 'removeAddonCompatibility',
  // The vouchers: the catalogue, its redemptions and what an instance redeems. Revoking a
  // redemption is a scope of the vouchers, not of the redemptions: a session that may
  // redeem a code cannot take a redemption back.
  'vouchers.list': 'listVouchers',
  'vouchers.read': 'getVoucher',
  'vouchers.lookup': 'lookupVoucher',
  'vouchers.create': 'createVoucher',
  'vouchers.update': 'updateVoucher',
  'vouchers.publish': 'publishVoucher',
  'vouchers.archive': 'archiveVoucher',
  'vouchers.redemptions': 'listVoucherRedemptions',
  'vouchers.revoke': 'revokeInstanceVoucher',
  'vouchers.validate': 'validateVoucher',
  'instance.vouchers.list': 'listInstanceVouchers',
  'instance.vouchers.redeem': 'redeemVoucher',
  // Invoices of the organization.
  'invoices.list': 'listInvoices',
  'invoices.export': 'exportInvoices',
  'invoice.read': 'getInvoice',
  'invoice.lineReports': 'listInvoiceLineReports',
  'invoice.markPaid': 'markInvoicePaid',
  'invoice.writeOff': 'writeOffInvoice',
  'invoice.void': 'voidInvoice',
  'invoice.recompose': 'recomposeInvoice',
  'invoice.releaseHold': 'releaseInvoiceHold',
  // An invoice a payment provider collects: pushing it again and reading it back.
  'invoice.retryPush': 'retryInvoicePush',
  'invoice.sync': 'syncInvoice',
  // The health of billing, and the pass that mirrors what the provider did.
  'health.read': 'getBillingHealth',
  'health.sync': 'syncBillingProvider',
  // The Stripe connector: its settings and its activation (scopes of the organization).
  'connector.settings.read': 'getConnectorSettings',
  'connector.settings.update': 'updateConnectorSettings',
  'connector.deactivate': 'deactivateConnector',
  // A customer in the payment provider, and the payment method it holds there.
  'customer.billing.read': 'getCustomerBilling',
  'customer.paymentMethod.createSession': 'createPaymentMethodSession',
  'customer.paymentMethod.complete': 'completePaymentMethodSession',
  'customer.paymentMethod.portal': 'createPortalSession',
  'customer.paymentMethod.detach': 'detachPaymentMethod',
  // The queue the organization's accounting system reads.
  'handoff.list': 'listHandoff',
  'handoff.acknowledge': 'ackHandoff',
  // Settings, the customer's billing e-mail and the usage history.
  'settings.read': 'getBillingSettings',
  'settings.update': 'updateBillingSettings',
  'customer.updateBillingEmail': 'updateCustomer',
  'usageHistory.list': 'listUsageReports',
  'usageHistory.export': 'exportUsageReports',
  'usageHistory.exportOrganization': 'exportOrganizationUsageReports',
} as const satisfies Record<string, ApiOperationId>;

export type BillingAction = keyof typeof BILLING_ACTIONS;

/** The operation an action calls. */
export function getActionOperation(action: BillingAction): ApiOperationId {
  return BILLING_ACTIONS[action];
}

/** The scopes the API requires of the operation the action calls. */
export function getActionScopes(action: BillingAction): readonly ApiScope[] {
  return OPERATION_SCOPES[BILLING_ACTIONS[action]];
}

/**
 * Whether the session may perform `action`, from its scopes. While they are
 * unknown (`null`) it can: the API refuses what the session may not do, with a
 * 403 that names the scope.
 */
export function canPerformAction(
  granted: GrantedScopes,
  action: BillingAction,
): boolean {
  return getActionScopes(action).every((scope) => hasScope(granted, scope));
}

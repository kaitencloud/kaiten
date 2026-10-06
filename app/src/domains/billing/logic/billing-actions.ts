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
  // An instance's subscription.
  'subscription.read': 'getInstanceBilling',
  'subscription.subscribe': 'subscribeInstance',
  'subscription.upcomingInvoice': 'getUpcomingInvoice',
  'subscription.invoices': 'listInstanceInvoices',
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

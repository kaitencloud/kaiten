/**
 * Scope of a NUMBER entitlement's usage counter: a PERIODIC value counts only
 * within the current reset window, a LIFETIME value counts for all time.
 */
export type UsageScope = 'LIFETIME' | 'PERIODIC';

type UsageWindowBounds = {
  currentPeriodEnd?: string | null;
  currentPeriodStart?: string | null;
};

/**
 * A NUMBER entitlement that declares a resetPeriod counts within a window; one
 * that does not counts for life. Neither LicenseEntitlement nor
 * EntitlementUsage carries resetPeriod, so the window bounds are the
 * discriminator: the API sets both exactly when a reset period is configured,
 * and it zero-fills usage for entitlements never reported -- so absent bounds
 * mean "lifetime counter", never "no report yet".
 */
export const isPeriodicEntitlement = (entitlement: UsageWindowBounds) =>
  Boolean(entitlement.currentPeriodStart && entitlement.currentPeriodEnd);

export const getUsageScope = (entitlement: UsageWindowBounds): UsageScope =>
  isPeriodicEntitlement(entitlement) ? 'PERIODIC' : 'LIFETIME';

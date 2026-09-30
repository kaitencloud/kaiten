// What an entitlement's usage counter means -- the window it is scoped to, the
// ceiling it is measured against, and where it stands against that ceiling.
// Business rules rather than infrastructure, shared by the dashboard,
// instances, entitlements and licenses features -- hence a domain and not
// lib/. Keep imports to this module going through this barrel (module public
// API), never via subpaths.
export { UsageMeter } from './components/usage-meter';
export { UsageStatusBadge } from './components/usage-status-badge';
export {
  getHighestAcceptedUsage,
  getLicenseEntitlementOveragePercent,
  getMaximumAllowedUsage,
  getUsagePercentage,
  getUsageRatio,
  isHardLimit,
  isSoftLimit,
  isUnlimitedThreshold,
  resolveLimitCapExceededOveragePercent,
  UNLIMITED_OVERAGE_PERCENT,
  UNLIMITED_THRESHOLD,
} from './entitlement-enforcement';
export {
  getUsageScope,
  isPeriodicEntitlement,
  type UsageScope,
} from './entitlement-usage-scope';
export {
  getUsageStatus,
  getUsageStatusTone,
  isUsageAtRisk,
  type UsageStatus,
} from './entitlement-usage-status';

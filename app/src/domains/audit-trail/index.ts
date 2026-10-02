// Shared audit-trail UI + data layer. Consumed by the global audit trail page,
// an instance's audit tab (event labels and status). Generic feed time helpers
// live in lib/feed-time. Use this public barrel for cross-module consumers.
export { type AuditEventName, resolveEventLabel } from './audit-trail-events';
export { getEventCategory } from './audit-trail.utils';
export { AuditTrailExportButton } from './components/audit-trail-export-button';
export { AuditTrailList } from './components/audit-trail-list';
export { AuditTrailStatsCards } from './components/audit-trail-stats-cards';
export type { AuditEventCategory, GlobalAuditEntry } from './audit-trail.types';
export {
  GLOBAL_AUDIT_TRAIL_LIMIT,
  GLOBAL_AUDIT_TRAIL_MAX_LIMIT,
  featureFlagAuditTrailBaseQueryKey,
  featureFlagAuditTrailQueryKey,
  featureFlagAuditTrailQueryOptions,
  globalAuditTrailBaseQueryKey,
  globalAuditTrailQueryKey,
  globalAuditTrailQueryOptions,
} from './queries';
export {
  type AuditTrailFiltersState,
  useAuditTrailFilters,
} from './use-audit-trail-filters';

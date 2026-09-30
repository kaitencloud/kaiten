import type { GlobalAuditEntry } from './audit-trail.types';

// Minimal structural shape of the GraphQL response, kept local so this module
// does not depend on the generated query type name.
interface RawOrganizationAuditTrail {
  id: string;
  eventName: string;
  eventType: string;
  instanceId?: string | null;
  instanceSlug?: string | null;
  instanceName?: string | null;
  customerName?: string | null;
  payload?: unknown;
  timestamp: string;
}

// Normalizes the org-wide feed into `GlobalAuditEntry` values (null → absent)
// and keeps the newest-first ordering guaranteed client-side.
export const toGlobalAuditEntries = (
  trails: RawOrganizationAuditTrail[] | null | undefined,
): GlobalAuditEntry[] =>
  (trails ?? [])
    .map((trail) => ({
      id: trail.id,
      eventName: trail.eventName,
      eventType: trail.eventType,
      instanceId: trail.instanceId ?? undefined,
      instanceSlug: trail.instanceSlug ?? undefined,
      instanceName: trail.instanceName ?? undefined,
      customerName: trail.customerName ?? undefined,
      payload: trail.payload ?? undefined,
      timestamp: trail.timestamp,
    }))
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() -
        new Date(left.timestamp).getTime(),
    );

import { queryOptions } from '@tanstack/react-query';
import type { GetGlobalAuditTrailQuery } from '@/api-client/graphql/graphql';
import { graphqlClient } from '@/lib/graphql-client';
import { toGlobalAuditEntries } from '../audit-trail-flatten';
import type { GlobalAuditEntry } from '../audit-trail.types';
import { GET_GLOBAL_AUDIT_TRAIL } from './global-audit-trail.queries';

// Number of newest entries fetched for the org-wide feed (API caps at 1000).
export const GLOBAL_AUDIT_TRAIL_LIMIT = 500;
export const GLOBAL_AUDIT_TRAIL_MAX_LIMIT = 1000;

export const globalAuditTrailBaseQueryKey = [
  'settings',
  'audit-trail',
  'global',
] as const;

export const globalAuditTrailQueryKey = (limit = GLOBAL_AUDIT_TRAIL_LIMIT) =>
  [...globalAuditTrailBaseQueryKey, limit] as const;

export const globalAuditTrailQueryOptions = (
  limit = GLOBAL_AUDIT_TRAIL_LIMIT,
) =>
  queryOptions({
    queryKey: globalAuditTrailQueryKey(limit),
    queryFn: async ({ signal }) => {
      const data = await graphqlClient.request<GetGlobalAuditTrailQuery>(
        GET_GLOBAL_AUDIT_TRAIL.toString(),
        { limit },
        signal,
      );
      return toGlobalAuditEntries(data.organizationAuditTrails.items);
    },
    // Keeps the feed reasonably fresh, in line with the per-instance audit
    // trail tab.
    refetchInterval: 30_000,
  });

// Matches the feature-flag domain events surfaced in the per-flag audit tab.
// The API does not (yet) scope the audit trail per feature flag — it is
// per-instance with an opaque payload that does not yet carry the read or
// evaluation context. Until then the tab filters the global feed down to every
// feature-flag event, matched on the event name and versioned event type so
// both `kaiten.v1.feature_flag.*` and `com.kaiten.*.feature_flag.*` forms hit.
const FEATURE_FLAG_EVENT_HINTS = ['feature_flag', 'featureflag'];

const isFeatureFlagAuditEvent = (entry: GlobalAuditEntry): boolean => {
  const haystack = `${entry.eventName} ${entry.eventType}`.toLowerCase();
  return FEATURE_FLAG_EVENT_HINTS.some((hint) => haystack.includes(hint));
};

export const featureFlagAuditTrailBaseQueryKey = [
  'feature-flags',
  'audit-trail',
] as const;

export const featureFlagAuditTrailQueryKey = (
  limit = GLOBAL_AUDIT_TRAIL_LIMIT,
) => [...featureFlagAuditTrailBaseQueryKey, limit] as const;

// Feed for the feature-flag detail "Audit trail" tab. Reuses the global
// aggregator query, then narrows to feature-flag events client-side — the API
// has no per-feature-flag audit endpoint yet. Not scoped to a single
// flag: every feature-flag event from the global feed is surfaced.
export const featureFlagAuditTrailQueryOptions = (
  limit = GLOBAL_AUDIT_TRAIL_LIMIT,
) =>
  queryOptions({
    queryKey: featureFlagAuditTrailQueryKey(limit),
    queryFn: async ({ signal }) => {
      const data = await graphqlClient.request<GetGlobalAuditTrailQuery>(
        GET_GLOBAL_AUDIT_TRAIL.toString(),
        { limit },
        signal,
      );
      return toGlobalAuditEntries(data.organizationAuditTrails.items).filter(
        isFeatureFlagAuditEvent,
      );
    },
    refetchInterval: 30_000,
  });

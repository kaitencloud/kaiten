import { graphql } from '@/api-client/graphql';

// Org-wide feed: `organizationAuditTrails` reads the audit_trail table for the
// whole organization, so events not attached to an instance (customer created,
// entitlement lifecycle, …) are included — unlike the previous per-instance
// aggregation. Instance/customer fields are null for those events.
// `changesOnly` leaves out, server-side, the reads and evaluations SDKs produce
// in bulk, so a short page of changes is not emptied by them.
export const GET_GLOBAL_AUDIT_TRAIL = graphql(`
  query GetGlobalAuditTrail($limit: Int, $changesOnly: Boolean) {
    organizationAuditTrails(limit: $limit, changesOnly: $changesOnly) {
      items {
        id
        eventName
        eventType
        instanceId
        instanceSlug
        instanceName
        customerName
        payload
        timestamp
        actor {
          id
          name
          kind
        }
      }
    }
  }
`);

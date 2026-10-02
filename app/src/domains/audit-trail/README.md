# Audit trail

The audit domain owns event labels/categories, aggregated queries, filters, CSV
export and audit UI. `audit-trail-events.ts` names contract events;
`audit-trail.utils.ts` categorizes/filters audit entries. Queries and components
have their own folders. The domain never owns a route.

Generic day grouping and localized time labels are in `lib/feed-time.ts`, shared
directly with notification feeds. They use the user's local calendar, separate
from UTC entitlement windows. Notifications do not import the audit domain for
time formatting. Category/status tests and audit/notification E2E cover the
consumers; query/invalidation ownership is unchanged.

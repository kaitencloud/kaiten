# Audit trail

The audit domain owns event labels/categories, aggregated queries, filters, CSV
export and audit UI. `audit-trail-events.ts` names contract events;
`audit-trail.utils.ts` categorizes/filters audit entries. Queries and components
have their own folders. The domain never owns a route.

`resolveEventReason` gives the reason an entry states beside its label: today,
an `INSTANCE_UPDATED` whose `licenseChangeReason` is `BILLING_FALLBACK`, the move
to the family's fallback license when a subscription ended (a cancellation, or a
trial that ended without a payment method). The global feed shows it in the
detail of a row, an instance's audit tab under the label and in its detail
dialog.

Generic day grouping and localized time labels are in `lib/feed-time.ts`, shared
directly with notification feeds. They use the user's local calendar, separate
from UTC entitlement windows. Notifications do not import the audit domain for
time formatting. Category/status tests and audit/notification E2E cover the
consumers; query/invalidation ownership is unchanged.

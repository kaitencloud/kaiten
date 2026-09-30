# Audit trail

The audit trail page lists the events of the whole organization, newest first: customers, instances, licenses, entitlements, releases and every other event the API records. A user searches and filters the feed, opens an event to read its payload, loads older events and exports the filtered events as a CSV file.

## Routes

| Path | Route file |
| --- | --- |
| `/audit-trail` | `app/src/routes/audit-trail/index.tsx` |

The side navigation pins the entry at the bottom, above Settings (`footerRoutes` in `app/src/routes/-components/side-nav/side-nav.constants.ts`). An instance's own audit tab, `/customers/instances/$instanceSlug/audit-trail`, belongs to the `instances` feature.

## Structure

```txt
app/src/features/audit-trail/
├── components/
│   ├── audit-trail-page-content.tsx   # the /audit-trail page
│   └── index.ts
└── index.ts
```

The feature is a thin shell. The page composes what `app/src/domains/audit-trail/` provides: the query, the filter state, the list, the stats cards, the CSV export and the event labels. That code lives in a domain because other features use part of it (see [Public API](#public-api)).

## Data

- The GraphQL document `GetGlobalAuditTrail` (`app/src/domains/audit-trail/queries/global-audit-trail.queries.ts`) reads `organizationAuditTrails(limit)`. It covers the whole organization, including events that belong to no instance, such as a customer created or an entitlement lifecycle change. For those events the instance and customer fields are empty.
- `globalAuditTrailQueryOptions(limit)` wraps the document. Its query key includes the limit, it sorts the entries newest first on the client, and it refetches every 30 seconds.
- The route loader calls `ensureQueryData(globalAuditTrailQueryOptions())`, so the first window is in the cache when the page renders.
- The feature has no mutation and nothing invalidates its queries.

## Behaviour

- **Window.** The page first loads the latest 500 events (`GLOBAL_AUDIT_TRAIL_LIMIT`). "Load older events" asks for 500 more, up to 1000 (`GLOBAL_AUDIT_TRAIL_MAX_LIMIT`, the API's ceiling), and keeps the current rows on screen while the larger window loads. The button shows only while the window is full and below the ceiling. A full window labels the first stat card "Latest N events" instead of "Total events", because it is not a total.
- **Filters.** They run on the client, over the loaded window: free-text search (event name and label, instance name and slug, customer name), status, time range (24 hours, 7 days, 30 days, all), event, instance and customer. The filter state lives in `useAuditTrailFilters`, so the header's Export button and the list read the same filtered result.
- **Status.** An event's status (read, accepted, rejected or warning) is derived from its name by `getEventCategory` in `app/src/domains/audit-trail/audit-trail.utils.ts`. A few names are mapped explicitly, and the others by their last word (a name ending in `_REJECTED` reads as rejected, one ending in `_CREATED` or `_ASSIGNED` as accepted). The word must match whole: `LICENSE_ENTITLEMENT_UNASSIGNED` is a removal like `_DELETED`, not an assignment, so it reads as a plain read. Any other name reads as a plain read. The stat cards, the status filter, the row's icon and badge and the CSV export all read that one function, and so does an instance's audit tab. The four statuses are this audit trail's own vocabulary, distinct from the tones of the [notifications](../notifications/README.md) feature (`notification-event-meta.ts`, where `INSTANCE_ENTITLEMENT_CAP_EXCEEDED` is destructive and `INSTANCE_STATUS_CHANGED` a warning), so do not align one on the other.
- **Warnings.** A warning tells a user that an entitlement's usage is approaching, at or past its limit, while the API still accepts the usage. Three events say so, each named in `KNOWN_CATEGORIES`: `INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED` (usage crossed the entitlement's early-warning percentage), `INSTANCE_ENTITLEMENT_USAGE_REACHED` (usage equals the cap, so the next report is refused on a hard limit or starts an overage on a soft one) and `INSTANCE_ENTITLEMENT_CAP_EXCEEDED` (a soft limit took a report above the cap and kept it). A refusal is not a warning: `ENTITLEMENT_USAGE_REPORT_REJECTED` and `CUSTOMER_CREATION_REJECTED` read as rejected. `INSTANCE_STATUS_CHANGED` reads as a plain read, because whether it is bad news depends on the new status in its payload, which the name does not carry. No last word reads as a warning: a name this build does not know (the API can emit one before the console has its label) is coloured from its last word like any other, so it is never guessed to be one. A new API event that should warn goes into `KNOWN_CATEGORIES`.
- **Rows.** Events are grouped by day. A row expands to show the event id, its versioned type, the instance, the customer, the timestamp and the raw JSON payload. The API returns no actor, so the feed shows none.
- **Labels.** `AUDIT_EVENT_LABEL_KEYS` (`app/src/domains/audit-trail/audit-trail-events.ts`) holds one translation key per event the API declares. It is typed against the events the OpenAPI document declares (`Webhooks['body']['name']`), so a new API event fails typecheck until it has a key. Add the label under `Features.AuditTrail.events` in `app/src/lib/i18n/locales/en.ts` and `fr.ts`; the unit test fails while a key has no translation. An event newer than the build falls back to its humanized name (`WIDGET_FROBNICATED` reads "Widget frobnicated").
- **Export.** The Export button downloads the filtered events as `audit-trail-<date>.csv`, generated in the browser, and shows a toast with the number of events. It is disabled when no event matches.
- **Empty state.** When no event matches the filters, the list shows "No audit trail entries found".

## Tests

- Unit: `app/src/domains/audit-trail/__tests__/audit-trail-events.test.ts` checks that every event has a label in English and French and that the fallback works. `audit-trail-status.test.ts` pins which of the events the API declares read as warnings (exactly the three above), as accepted and as rejected (each list in full, so an event that changes status fails the test), that a refusal, an unassignment and a status change are not warnings, that the status filter and the CSV export read the same status, and how an event this build does not know is coloured (each ending, as a whole word).
- Stories: `app/src/domains/audit-trail/components/stories/audit-trail-content.stories.tsx` (`Domains/AuditTrail`: `Default`, `Warnings`, `LongEventFilter`, `Empty`). `Warnings` reads the Warnings card, filters on Warning and checks the badges.
- E2E: `app/e2e/app/audit-trail/audit-trail.read.spec.ts` opens `/audit-trail` with a seeded feed (`audit-trail.scenarios.ts`), checks the Warnings card, the badges of the usage events and the Warning status filter. The mocks answer `GetGlobalAuditTrail` from the `auditTrail` slot (`AuditTrailAppModel`), which checks each seeded event (name, versioned type and payload) against the OpenAPI schema of that event, so `pnpm run check:e2e-contracts` fails on a seed the API would not emit. The stories' sample feed repeats the usage payloads by hand, and nothing checks it.

## Public API

`app/src/features/audit-trail/index.ts` exports `AuditTrailPageContent`. Only `app/src/routes/audit-trail/index.tsx` imports it, as routes are the only importers of a feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)).

`@/domains/audit-trail` is the shared part:

- The `instances` feature reads its event labels and statuses from it, through `resolveEventLabel` and `getEventCategory`, so an event reads the same in an instance's audit tab and in the global feed.
- The `notifications` feature reuses its day grouping and relative times.
- The `webhooks` feature reuses `AuditEventName` and `resolveEventLabel` for its event catalogue.

# Notifications

Notifications tell a user what happened in the organization, restricted to the events that user subscribes to. A notification is a view over the organization's audit trail: its id is the id of the audit trail entry it reports. A bell in the header shows the unread count and opens a panel with the latest notifications. A page lists the whole feed, which a user filters by status and by kind of object and marks as read. A preferences page chooses which events notify the user. New notifications arrive live through a Server-Sent Events stream.

## Routes

| URL | Route file | Renders |
| --- | --- | --- |
| `/notifications` | `app/src/routes/notifications/index.tsx` | `NotificationsPageContent` |
| `/settings/notifications` | `app/src/routes/settings/notifications.tsx` | `NotificationPreferencesContent` |

The bell has no route. `NotificationBell` sits in the header of the root layout (`app/src/routes/__root.tsx`), so it is on every page. Neither route has a side navigation entry: the feed page opens from the bell panel's "View all notifications" link, and the preferences page from the "Configure notifications" card of `/settings` and from the "Preferences" button of the feed page.

`/notifications` takes an optional `status` search parameter, `all` (the default) or `unread`, validated by a Zod enum in the route. Choosing "All" removes the parameter. The loader loads the first page of the feed for that status through `ensureInfiniteQueryData`. The preferences loader calls `ensureQueryData(notificationPreferencesQueryOptions)`.

## Structure

```txt
app/src/features/notifications/
├── index.ts                     # route-level exports
├── notifications.api.ts         # notificationStreamUrl(): the one endpoint outside the contract
├── constants.ts                 # NOTIFICATION_OBJECT_TYPES
├── components/
│   ├── notification-bell.tsx                    # badge and popover; opens the stream
│   ├── notification-panel.tsx                   # the popover: the latest notifications
│   ├── notification-item.tsx                    # one entry of the panel
│   ├── notifications-page-content.tsx           # /notifications: header, status and object filters
│   ├── notifications-feed-list.tsx              # paged rows, grouped by day
│   ├── notification-row.tsx                     # one row of the feed
│   ├── notification-status-segments.tsx         # All / Unread
│   ├── notification-event-meta.ts               # icon and tone per event
│   ├── notification-preferences-content.tsx     # /settings/notifications
│   ├── notification-preference-group-card.tsx   # one group of events
│   └── notification-preference-groups.ts        # group titles, event descriptions
├── hooks/                       # mark read, day groups, object filter, preferences, stream, open
├── queries/                     # query options and cache helpers
├── schemas/                     # Zod schemas of the stream's frames
└── types/                       # names for the generated types, event names
```

In this page, a path inside the feature is relative to `app/src/features/notifications/`. Any other path starts at the repository root.

The feature reuses `@/lib/feed-time` for local-calendar day grouping and localized relative times, and the `filters` and `page` functionals. Audit event categories remain in the audit domain.

## Data

The REST operations come from the generated client, so the wire types are the generated ones (`types/index.ts` only gives them the names the feature uses).

| Operation | Used by |
| --- | --- |
| `listNotifications` (`GET /v1/notifications`) | `notificationsFeedQueryOptions(status, objectTypes)` (infinite, cursor paged, 25 per page) and `notificationsUnreadCountQueryOptions` |
| `markNotificationsRead` (`POST /v1/notifications/mark-read`) | `useMarkNotificationsRead`, with `{ ids }` or `{ all: true }` |
| `getNotificationPreferences` (`GET /v1/notification-preferences`) | `notificationPreferencesQueryOptions` |
| `putNotificationPreferences` (`PUT /v1/notification-preferences`) | `useNotificationPreferencesMutation` |

The feed's query keys are the generated ones (`listNotificationsInfiniteQueryKey`, `listNotificationsQueryKey`, `getNotificationPreferencesQueryKey`). `notificationsFeedQueryOptions` calls the generated `listNotifications` under the generated key, but not through the generated `listNotificationsInfiniteOptions`, whose `queryFn` may be `skipToken` and which `useSuspenseInfiniteQuery` refuses. The selected object types are sorted into the key, so the same selection picked in another order reads the same cache entry.

The unread count travels on every page of the list, so the bell reads it from the smallest page of unread notifications (`status: 'unread'`, `limit: 1`, with `select: (list) => list.unreadCount`). That query does not retry: the bell is mounted on every page, and an API that is down must not start a retry loop. The API caps the count it returns.

- `invalidateNotificationFeedQueries` invalidates the feed and the unread count.
- `setUnreadCount` writes a count into the cached unread-count page. With no cached page, the bell's own fetch brings the count.
- A successful mark-as-read writes the count the API answers with, then invalidates the feed.
- `useNotificationPreferencesMutation` is optimistic: it cancels the preferences query, writes the change into the cached matrix, restores the previous matrix on error and shows a toast, and invalidates when it settles.

An error of any mutation shows `toast.error(getApiErrorMessage(error))`.

**The stream.** `GET /v1/notifications/stream` is not in `app/openapi.yaml`, because an OpenAPI document does not describe a Server-Sent Events stream, so `notifications.api.ts` only builds its URL (`notificationStreamUrl()`, `${API_URL}/v1/notifications/stream`). `useNotificationStream`, called by `NotificationBell`, opens an `EventSource` on it. Its three frames are declared in `schemas/index.ts` around the generated `zNotification`:

| Frame | Payload |
| --- | --- |
| `connected` | `{ unreadCount }`, sent on the first open and on every reconnect |
| `notification` | `{ notification, unreadCount }` |
| `read` | `{ unreadCount }` |

Each frame writes its count with `setUnreadCount` and invalidates the feed, so the stream is a hint and the requests stay the source of truth. A frame that does not parse is ignored.

`EventSource` cannot set an `Authorization` header, so the stream authenticates with the session cookie: it is opened with `withCredentials`, the gateway route reads the `__session` cookie for this one path (`docker/envoy/kaiten.yaml.tmpl`), and the API moves the cookie into the `Authorization` header for that path only (`notificationStreamPath` in `api/internal/infrastructure/http/server/server.go`). With `VITE_LOCAL_AUTH`, choosing a dev token writes it to the same cookie (`setDevToken` in `app/src/lib/local-auth.ts`).

The browser's own reconnection is not used: on an error the source is closed and a new one opens after 5 seconds. After 3 consecutive failures the hook stops trying until the page is reloaded, so a stack with no stream endpoint is not retried forever. A successful open resets the count.

**Event names.** `types/event-names.ts` defines `KaitenEventName` from the generated `Webhooks` type, the events the OpenAPI document declares. `notification-event-meta.ts` (icon and tone) and `notification-preference-groups.ts` (descriptions) are maps typed with it, so an event name that leaves the contract fails the type check. At runtime the lookups stay open: an event this build does not know still renders, with a bell icon and no description. The server catalogue is in `api/internal/modules/notifications/catalogue`.

Scopes: the API requires `read:notifications` to list the feed, read the preferences and open the stream, and `write:notifications` to mark notifications read and save the preferences. The screens do not check scopes themselves.

## Behaviour

**Bell and panel.** The badge shows the unread count, and "9+" above 9. The panel shows the first 6 notifications of the "all" feed grouped by day, and reads the same query as the feed page does for All with no object filter. It has a "Mark all as read" button, shown when there is something unread, and a "View all notifications" link to `/notifications`. While loading it shows skeletons. When the request fails it says the notifications could not be loaded. With no notification it says "You're all caught up".

**Opening a notification.** The panel and the feed both use `useOpenNotification`: it starts marking an unread notification read and goes to its `actionUrl` at once, without waiting for the request. That path is rendered by the server and unknown to the typed route tree, so the hook pushes it with `router.history.push`. The panel closes first.

**Feed page.** The rows are grouped by day (Today, Yesterday, then dates), each with an icon, a title, a body, a status badge and a time. "Load more" fetches the next page. The status control switches between All and Unread and shows the unread count. "Mark all as read" follows the unfiltered count, whereas the count beside "Unread" describes the list under the current filter. The page uses `Page layout="scroll"` (see [page scrolling](../../../docs/03-patterns/page-scrolling.md)).

**Object filter.** It is a quick-access chip built with `useFilterBuilder` (`use-notification-object-filter.ts`). The selection goes to the API as the `objectType` parameter, and is not applied to the rows already loaded, because the server pages the feed and a client filter would only ever cover the first page. The options come from the generated contract (`NOTIFICATION_OBJECT_TYPES`, read from `zListNotificationsQuery`), each with a label under `Pages.Notifications.filters.objectTypes` in `en.ts` and `fr.ts`. An object type the API adds appears after the next `pnpm run generate` in `app/`, and needs its label.

**Empty states.** With an object filter, the feed says that no notification matches the filters, whatever the status. Otherwise it says "No unread notifications" on the Unread status and "You're all caught up" on All.

**Preferences.** The page shows a matrix of events. Version 1 of the contract has a single channel: the page drives `matrix.channels[0]`, or `in_app` when the list is empty. The server sends each event with its label and a group; the client owns what a group is called and shows (`GROUP_DEFS` in `notification-preference-groups.ts`), and a group it does not know falls under "Other". An event's description is client copy, missing for an event added after this build. Each event has a switch, each group has a switch that is on when all its events are on, and "Enable all" and "Pause all" act on every event. A group folds away on its own (all start open). A "Saved" chip appears for about two seconds after each successful save.

## Tests

- Unit and component tests: none in the feature. No story either.
- E2E: `app/e2e/app/notifications/notifications.read.spec.ts`, with its scenarios in `notifications.scenarios.ts`, the `NotificationsDriver` (`app/e2e/app/_support/drivers/notifications.driver.ts`) and the mocks of `installNotificationAppMocks`. It covers the bell and the panel, opening a notification (it is marked read and its action URL opens), the object filter, "Mark all as read", saving a preference across a reload and folding a preference group. The mocks are MSW only, because the page-route interception cannot serve the stream. Run it with `pnpm run test:e2e:app` from `app/`.
- UI work without the API: `VITE_MOCK_NOTIFICATIONS=true` serves only the notifications endpoints, and a mock stream that emits a demo notification every 45 seconds, from Mock Service Worker (`app/src/e2e/msw/notifications-dev-seed.ts`); every other request reaches the real API. See [environments](../../../docs/07-deployment/environments.md).

## Public API

`app/src/features/notifications/index.ts` exports `NotificationBell`, `NotificationsPageContent`, `NotificationPreferencesContent`, `notificationsFeedQueryOptions` and `notificationPreferencesQueryOptions`. Only routes import them, as routes are the only importers of a feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)): `app/src/routes/__root.tsx` for the bell, `app/src/routes/notifications/index.tsx` and `app/src/routes/settings/notifications.tsx` for the pages and their query options.

The E2E scenarios import the `Notification` type from `@/features/notifications/types`. `pnpm run check:architecture` reads `app/src` only, so it does not see that import.

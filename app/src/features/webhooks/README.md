# Webhooks

The Webhooks page manages outbound webhooks: HTTP endpoints that receive an event when something changes in the organization. A user creates a webhook by choosing the events it subscribes to and the URL to call, reveals and copies its signing secret, deletes it, and reads the delivery history: every attempt with its status and, for a failure, the response the endpoint gave.

## Routes

| URL | Route file | Renders |
| --- | --- | --- |
| `/integrations/webhooks` | `app/src/routes/integrations/webhooks/route.tsx` (layout) and `index.tsx` | `WebhooksPageContent` around the Events tab, which is `WebhookList` |
| `/integrations/webhooks/history` | `app/src/routes/integrations/webhooks/history.tsx` | `WebhookHistorySection`, the History tab |

`route.tsx` sets the "Webhooks" breadcrumb title and renders `WebhooksPageContent` (header and route tabs) around an `Outlet` in a Suspense boundary. The list loader calls `ensureQueryData(webhooksQueryOptions)`. The history loader loads the history and the list, because the history resolves a webhook's URL from the list. The side navigation entry comes from `integrationsSubRoutes` in `app/src/routes/-components/side-nav/side-nav.constants.ts`.

## Structure

```txt
app/src/features/webhooks/
├── index.ts                        # route-level exports
├── webhooks.api.ts                 # the five hand-written REST calls
├── components/
│   ├── webhooks-page-content.tsx   # header and tabs, around the routed tab
│   ├── webhooks-tabs.tsx           # Events and History route tabs
│   ├── webhook-list/               # controller, list, table, secret cell, create dialog
│   ├── webhook-history/            # section, columns, filters, failure dialog, empty state
│   ├── stories/                    # webhooks.stories.tsx and its fixtures
│   └── __tests__/
├── hooks/                          # useWebhookMutations (test beside it)
├── queries/                        # query options and invalidation
├── schemas/                        # create-webhook.schema.ts
├── types/
└── utils/                          # event catalogue, mappers, isValidUrl
```

In this page, a path inside the feature is relative to `app/src/features/webhooks/`. Any other path starts at the repository root.

There is no `store/`: everything the feature holds is server state in TanStack Query, plus local component state (dialog open, secret visibility, the failure dialog's entry).

## Data

The webhook endpoints are not described by `app/openapi.yaml`, whose `webhooks` section declares the events, not these paths. There is nothing to generate, so `webhooks.api.ts` calls the shared `client` (`@/api-client/client.gen`) by hand, with the local types of `types/index.ts`. `lib/api/bootstrap.ts` initializes that shared transport before routes, including the base URL, current bearer token and `ApiError` wrapping. See [Generated code](../../../docs/AI_CONTEXT.md#generated-code).

The response shapes below are the types the client declares for each call. Nothing in this repository serves these paths.

| Call | Request | Used by |
| --- | --- | --- |
| `getWebhooks` | `GET /webhooks`, a list of webhooks | `webhooksQueryOptions` |
| `getWebhook` | `GET /webhooks/{webhookId}`, one webhook with its `signingSecret` | `webhookDetailQueryOptions` |
| `getWebhookHistory` | `GET /webhooks/history`, `{ history: [...] }` | `webhookHistoryQueryOptions` |
| `createWebhook` | `POST /webhooks` with `{ eventTypes, url }`, typed as returning the created webhook | `useWebhookMutations` |
| `deleteWebhook` | `DELETE /webhooks/{webhookId}` | `useWebhookMutations` |

A webhook is `{ id, eventTypes, url, signingSecret?, createdAt?, updatedAt? }`. A history entry is `{ date, hookId, hookUrl, eventType, status, responseStatusCode?, responseStatusText? }`, with `status` one of `success`, `pending`, `fail` and `sending`. `eventType` is empty when the delivery's message could not be looked up.

The query keys are hand-written constants, because no generated key exists: `webhooksQueryOptions` uses `['webhooks']`, the history `['webhooks', 'history']` and one webhook's detail `['webhooks', 'detail', webhookId]` (`staleTime` is infinite). `invalidateWebhookQueries` invalidates the list and history keys; because `['webhooks']` is a prefix of all three keys, it reaches the detail entries as well. `useWebhookMutations` (`createWebhook`, `deleteWebhook`) updates the list cache with `setQueryData` first, then invalidates the webhook queries: create upserts the returned webhook into the list, delete removes the webhook from it. An error shows `toast.error(getApiErrorMessage(error))`; a success shows no toast.

The create form's schema, `createWebhookFormSchema`, is a plain `z.object`: at least one event type, and a trimmed, valid URL. It does not start from a generated schema, for the same reason as the calls.

The feature has no GraphQL document.

Scopes: the token picker offers `read:webhooks` and `write:webhooks` (`app/src/lib/api/scopes.gen.ts`). No operation of `api/` enforces them (see `Webhooks` in `api/pkg/scope/scope.go`), and the screens do not check scopes themselves.

## Behaviour

**Availability.** The paths above are not served by the API in `api/`, and the stack in `compose.yml` does not route `/api/webhooks` to a service either (see the header of `docker/envoy/kaiten.yaml.tmpl`, and the [README](../../../../README.md) for what a deployment adds). No flag and no entitlement gate the feature in the console. The side navigation always lists Webhooks (`integrationsSubRoutes` is a fixed list), and no webhooks route has a guard: `route.tsx` and `history.tsx` use `beforeLoad` only to set the breadcrumb title. Where nothing answers `/api/webhooks`, a loader rejects and the router renders `RouteError` (`app/src/components/route/route-error.tsx`): a 404 reads as the not-found page, any other failure as an error card with a retry button.

**Events tab.** `WebhookTable` lists each webhook's events (by name, such as `CUSTOMER_CREATED`), URL, masked signing secret and creation date, newest first. The creation date is the only sortable column. When the event summary is truncated, a tooltip lists the events by group. A search box filters on the URL and on each event's type, name, label and group title. The delete action asks for confirmation and names the webhook's URL.

**Create dialog.** "New Webhook" opens `CreateWebhookDialog` from local state (`addDialogOpen` in `webhook-list.controller.ts`), not from a route of its own (see [dialog via route](../../../docs/03-patterns/dialog-via-route.md)). Events are checkboxes grouped by category, in a scrollable list, with a summary of the selection below. The Create button stays disabled until the form is valid and changed. The dialog closes when the request succeeds. When it fails, a toast shows the error and the dialog stays open.

**Signing secret.** The secret is masked by default. The eye button reveals it. If the list response already carried it, the cell uses that. Otherwise the cell fetches `GET /webhooks/{webhookId}` through `queryClient.fetchQuery(webhookDetailQueryOptions(id))` and keeps the result for the row. Once revealed, a copy button writes it to the clipboard. A failed load or copy shows an error toast.

**History tab.** Entries are sorted newest first on the client. A row shows the date, the webhook URL, the event, a status badge, the failure text and a "View details" button. A failed delivery's badge carries the response status code. On a failed delivery with a response text, the button opens `WebhookHistoryFailureDialog`, which shows the entry's own `hookUrl` (empty when the API sends none), the status code and the response text. The table row and the filters resolve the webhook URL differently: the entry's `hookUrl`, then the webhook list by id, then the id itself. The filters are:

- a free-text search over the URL, id, event, response text and status code;
- the event and the webhook, both quick-access chips with their own search box (`searchable`);
- the status and the date, available in the advanced filter only.

**Events.** A subscription names its events by type, such as `com.kaiten.license.v1.created`: the type the API publishes each event under, and the value a subscription filters deliveries on. The delivery history reports the same type.

- `utils/webhook-event-catalogue.ts` maps every audit event name to its type and to a group. It is typed against the generated `Webhooks` union and against `AuditEventName`, so an event that the API adds, renames or retypes fails the type check until it is listed. An entry looks like this:

  ```ts
  // app/src/features/webhooks/utils/webhook-event-catalogue.ts
  CUSTOMER_CREATED: {
    type: 'com.kaiten.customer.v1.created',
    group: 'customer',
  },
  ```

- An event's label is the audit trail's (`resolveEventLabel` from `@/domains/audit-trail`). Group titles are the `Pages.Integrations.Webhooks.EventGroups` keys of `en.ts` and `fr.ts`.
- `group: null` keeps an event out of the create dialog. Two events have it, `FEATURE_FLAG_EVALUATED` and `ENTITLEMENT_VALUE_GET`. The API triggers them on every flag evaluation and on every read of an entitlement's usage value, so a subscription would receive one request each time.
- A type this build does not know, an event newer than the console, shows as the type itself, under the group "Other events".

**Empty states.** With no webhook, the Events tab shows "No webhooks configured yet." and a hint. With webhooks but no match for the search, it shows "No results". The History tab has its own two states: no delivery yet, and no delivery matching the filters.

## Tests

- Unit and component tests:
  - `components/__tests__/webhooks-tabs.test.tsx`
  - `components/webhook-list/__tests__/create-webhook-dialog.test.tsx`, `webhook-list.test.tsx` and `webhook-table.test.tsx`
  - `components/webhook-history/__tests__/webhook-history-section.test.tsx`
  - `hooks/use-webhook-mutations.test.tsx`
  - `utils/__tests__/webhook-events.test.ts`, which checks the catalogue (a type per event, a title per group in both locales, the two events kept out of the dialog)

  `pnpm run test` from `app/` runs them.
- Stories: `components/stories/webhooks.stories.tsx` (`Features/Webhooks/P0WebhooksStories`: `PageWithList`, `Table`, `EmptyList`, `NoSearchResults`, `CreateDialog`, `History`, `FailureDialog`), with `webhooks.fixtures.ts`. The file is listed in `storybookTestExclude` in `app/vite.config.ts`, so `pnpm run test:stories` skips it. The stories stay available in Storybook.
- E2E: none. No spec in `app/e2e/app/` covers the page, and the visual regression suite has no webhook story.

## Public API

`app/src/features/webhooks/index.ts` exports `WebhooksPageContent`, `WebhookList`, `WebhookHistorySection`, `WebhooksTabs`, `webhooksQueryOptions`, `webhookHistoryQueryOptions` and the `Webhook` type. The three routes under `app/src/routes/integrations/webhooks/` import `WebhooksPageContent`, `WebhookList`, `WebhookHistorySection` and the two query options, as routes are the only importers of a feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)). Nothing imports `WebhooksTabs` or the `Webhook` type from outside the feature.

The feature depends on `@/domains/audit-trail` for `AuditEventName` and `resolveEventLabel`, and on the `filters`, `table`, `page` and `route-tabs` functionals.

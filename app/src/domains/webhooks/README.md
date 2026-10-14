# Webhooks

What the rest of the console needs to know about outbound webhooks without
importing the [webhooks feature](../../features/webhooks/README.md): whether they
are served to the signed-in organization. A feature does not import another
feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)), and the
token scope picker of `service-accounts` needs the answer as much as the side
navigation and the webhooks routes do.

## Where the answer comes from

Outbound webhooks are served by saas-api, which only Kaiten Cloud deploys.
`webhooks` is a NUMBER entitlement of the Kaiten licence: the webhook events
the organization may publish each calendar month. saas-api reads the grant on
every webhooks route and refuses an organization whose licence grants it 0,
because with no event to publish there is nothing to configure. Any other
grant, unlimited included, serves the routes; how many events are then sent is
counted by saas-api on delivery, and going over the allowance is recorded,
never enforced, so it changes nothing here. So the console asks the routes themselves, with
`GET /webhooks` (`getWebhooksServed`, `webhooks-served.ts`):

| `GET /webhooks` answers | Meaning | `getWebhooksServed` |
| --- | --- | --- |
| 2xx | served | `true` |
| 404 | nothing serves the path: a self-hosted deployment has no saas-api | `false` |
| 403 | refused: the licence grants 0 webhook events, or none (`Webhooks.NotEntitled`), or the caller has no `read:webhooks` | `false` |
| anything else (503 `Webhooks.EntitlementVerificationUnavailable`, a network error) | no answer | throws |

No platform flag and no console setting decides it. The call is written by
hand, on the shared `client`, because `app/openapi.yaml` does not describe the
webhooks paths (see the feature's [Data](../../features/webhooks/README.md#data)).

## Public API

`index.ts` exports:

- `webhooksServedQueryOptions`: the query, keyed `['webhooks-served']` rather
  than under the feature's `['webhooks']` keys, which its mutations invalidate.
  `staleTime` is five minutes, and a failed read is not retried: the query is
  in error and the next mount or navigation asks again.
- `useWebhooksServed()`: the answer for a list whose entries depend on it,
  `false` while it is read or when it could not be read. The side navigation
  (`app/src/routes/-components/side-nav/side-nav-sections.tsx`) and the token
  scope picker
  (`app/src/features/service-accounts/components/token-create/scope-access-table.tsx`)
  use it.
- `getWebhooksServed`, the query function.

The route guard of `/integrations/webhooks`
(`app/src/routes/integrations/webhooks/route.tsx`, the parent of the list and the
history) calls `ensureQueryData(webhooksServedQueryOptions)`: `false` throws
`notFound()`, and an error reaches the router's retryable error page.

## Tests

- `__tests__/webhooks-served.test.ts`: each row of the table above.
- The consumers' own tests seed the query: `side-nav-sections.test.tsx`,
  `-route.test.ts` (which also drives a 403 and a 503 through the guard),
  `scope-access-table.test.tsx`, and the side navigation and token stories.
- E2E: `app/e2e/app/integrations/integrations.webhooks.spec.ts` runs a
  self-hosted console (the mocks answer the webhooks routes 404 by default), an
  organization whose licence grants no webhook events (`installWebhooksNotEntitledStub`)
  and Kaiten Cloud (`installEmptyWebhooksStub`).

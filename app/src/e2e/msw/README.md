# Browser mock adapter

`handlers.ts` rehydrates models and assembles handlers in their first-match
order, with explicit sibling fallbacks last. `browser.ts` starts MSW. Each object owns a
`*-handlers.ts` set; stateful business logic remains in
`e2e/app/_support/model/<area>-app-model.ts`. A REST handler starts from the
operation's handler generated from the OpenAPI contract (`@/api-client/msw.gen`),
so its path, params and body are typed; GraphQL and the notification stream,
which the contract does not describe, are written by hand.

Billing is served by four files: `billing-handlers.ts` (the capabilities, and
the assembly of the invoice handlers; the prices and the preview of a license
version are the license handlers'), `billing-invoice-handlers.ts` (the invoices,
their lines' usage reports, the exports and the handoff queue, which read the
filters, the cursor and the paging of the request as the API does),
`billing-subscription-handlers.ts` (the subscription of an instance and the
subscribe, its upcoming invoice, its invoices, the billing defaults of the
organization, and the prices of a license version for the slot that does not own the
licenses) and `billing-problems.ts`, which renders a refusal of the model as
`application/problem+json`, with the code, the detail, the trace id and
`Retry-After` the API would send. The state behind them is `BillingInvoices`, in
`e2e/app/_support/model/billing-invoices.ts`, and `BillingSubscriptions`, in
`billing-subscriptions.ts`, which issues the activation invoice of a subscribe into the
first. The usage history of an entitlement of an instance, with its exports, is
the instances': `instance-handlers.ts` serves it from `InstanceUsageHistory`
(`instance-usage-history.ts`), within what the organization keeps, with the codes of
the API. `src/__tests__/billing-subscription-mocks.test.ts`,
`usage-history-mocks.test.ts` and `billing-refusal-mocks.test.ts` read their answers
off the wire.

`page-network.ts` runs the same handlers in the page, patching `fetch` and
`XMLHttpRequest`: the stories use it, and the bootstrap when a browser refuses
the service worker (the notification stream, an `EventSource`, is then left
unserved).

`persistence.ts` updates serialized slots in sessionStorage after mutations and
integration reads, preserving state on navigation/reload. The canonical slot
types and storage key live in `e2e/app/_support/contracts/msw-slots.ts`, with no
browser or Playwright dependency. Error mapping and GraphQL descriptions live
in browser-free support modules used by MSW handlers.

MSW is the application suite's only mock implementation. Notifications require
the service worker for their stream. The transport contract
spec verifies CRUD, injected errors, reloads, PATCH 204, metadata filtering and
instance audit responses. The service worker and in-page fallback execute the
same handlers and persistence. Dev notifications use the same
worker with unmocked flags passed through, and `pnpm run dev:mock`
(`VITE_MOCK_API`, `dev.ts`) installs every slot in it, seeded from one world of
records the areas share (`dev-world/`), with a warning for each API request no
slot answers. `src/__tests__/dev-world.test.ts` builds that world through the
models, which check it against the contract, and checks that its references
resolve. E2E defaults unmocked platform flags off and the webhooks routes to 404
(no saas-api), answers the billing capabilities with billing off (the shell reads
them on every page; the unit network and the stories' network do the same) and
fails undeclared API requests with a network error; the shared Playwright fixture fails on the
named console error. Explicit shell fallbacks run after model owners.
Dev-world mocks warn and pass through, and partial notification mocks pass
through the business API, flags and webhooks. See the [mock policy](../../../e2e/README.md#mock-policy).

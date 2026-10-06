# Browser mock adapter

`handlers.ts` rehydrates models and assembles handlers in their first-match
order, with explicit sibling fallbacks last. `browser.ts` starts MSW. Each object owns a
`*-handlers.ts` set; stateful business logic remains in
`e2e/app/_support/model/<area>-app-model.ts`. A REST handler starts from the
operation's handler generated from the OpenAPI contract (`@/api-client/msw.gen`),
so its path, params and body are typed; GraphQL and the notification stream,
which the contract does not describe, are written by hand.

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
resolve. E2E defaults unmocked platform flags off, answers the billing capabilities
with billing off (the shell reads them on every page; the unit network and the
stories' network do the same) and fails undeclared API
requests with a network error; the shared Playwright fixture fails on the
named console error. Explicit shell fallbacks run after model owners.
Dev-world mocks warn and pass through, and partial notification mocks pass
through the business API and flags. See the [mock policy](../../../e2e/README.md#mock-policy).

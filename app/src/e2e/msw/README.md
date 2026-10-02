# Browser mock adapter

`browser.ts` rehydrates models, assembles handlers in their existing first-match
order, puts explicit sibling fallbacks last and starts MSW. Each object owns a
`*-handlers.ts` set; stateful business logic remains in
`e2e/app/_support/model/<area>-app-model.ts`.

`persistence.ts` updates serialized slots in sessionStorage after mutations and
integration reads, preserving state on navigation/reload. The canonical slot
types and storage key live in `e2e/app/_support/contracts/msw-slots.ts`, with no
browser or Playwright dependency. Error mapping and GraphQL descriptions share
neutral support modules with the legacy page.route adapter.

MSW is the application suite's default. `E2E_MOCKS=page-route` retains the legacy
diagnostic adapter for the existing installers; notifications require MSW for
their stream. Full parity is not claimed. REST transport-specific dispatch,
unknown-operation handling and persistence remain separate. Contract/parity
strengthening belongs to the next test phase. Dev notifications use the same
worker with unmocked flags passed through. E2E defaults unmocked platform flags
off; other unhandled requests retain bypass.

# Browser mock adapter

`handlers.ts` rehydrates models and assembles handlers in their first-match
order, with explicit sibling fallbacks last. `browser.ts` starts MSW. Each object owns a
`*-handlers.ts` set; stateful business logic remains in
`e2e/app/_support/model/<area>-app-model.ts`. A REST handler starts from the
operation's handler generated from the OpenAPI contract (`@/api-client/msw.gen`),
so its path, params and body are typed; GraphQL and the notification stream,
which the contract does not describe, are written by hand.

Billing is served by seven files: `billing-handlers.ts` (the capabilities, and
the assembly of the invoice handlers; the prices and the preview of a license
version are the license handlers'), `billing-invoice-handlers.ts` (the invoices,
their lines' usage reports, the exports and the handoff queue, which read the
filters, the cursor and the paging of the request as the API does),
`billing-subscription-handlers.ts` (the subscription of an instance and the
subscribe, which takes the add-ons it starts with, its upcoming invoice, its
invoices, the billing defaults of the organization, and the prices of a license
version for the slot that does not own the licenses), `billing-addon-handlers.ts`
(the catalogue of add-ons, and the add-ons an instance holds), `billing-voucher-handlers.ts`
(the vouchers, and what an instance redeemed of them),
`billing-provider-handlers.ts` (what the payment provider adds: the health of billing and
the pass that mirrors the provider, a customer as the provider holds it, the payment method
it saves, replaces and removes through the pages it hosts, and its portal) and
`billing-problems.ts`, which renders a refusal of the model as
`application/problem+json`, with the code, the detail, the trace id and
`Retry-After` the API would send. The state behind them is `BillingInvoices`, in
`e2e/app/_support/model/billing-invoices.ts`, and `BillingSubscriptions`, in
`billing-subscriptions.ts`, which issues the activation invoice of a subscribe into the
first. The payment provider's side is `BillingProviders` (`billing-providers.ts`): the customers
as Stripe holds them with their payment methods, the hosted pages a customer is sent to and how
they ended there, the health of billing (counted from the invoices and the subscriptions unless a
spec sets it) and the pass that mirrors the provider. It refuses with the codes and in the order
the API does, and what the provider does to an invoice is `BillingInvoices`'s own: a push goes
into a queue whose job runs when the invoice is read a second time (a spec leaves one queued for
good with `stalledPushes`, or has it fail again with `pushFailures`), a read back applies what the
provider says (`providerTruth`: a payment, a void, a finalization), and a void goes through the
provider first, refusing an invoice it reports paid with `paid_at_provider`. A move of a
subscription to a provider checks the world as the API does (`ProviderRules`: the provider is
connected, it can charge, the customer has an address or a payment method, the currency). The catalogue of add-ons is `AddonCatalogue` (`billing-addon-catalogue.ts`: the
families and their versions, what a version grants and is sold for, which license
families it fits, and the freeze of a version an instance with a live subscription holds,
which it learns from the instances), and what an instance holds is `InstanceAddons`
(`billing-instance-addons.ts`: the attachments, their quantities and the refusals of the
API, `BoundaryPending` included). The vouchers are `BillingVouchers`
(`billing-vouchers.ts`, with the rules of the API in `billing-voucher-rules.ts`: what a
draft must satisfy, the checks of a redemption in the order the API makes them and the
codes it gives, and the quirks the console works around -- no voucher is ever set EXPIRED,
an update of an ACTIVE voucher writes the rules and the description it is given and
ignores a changed grant). A PRICE redemption discounts the invoices an instance receives,
which `billing-discounts.ts` composes as the composer of the API does, for the invoice a
subscribe issues and for the upcoming invoice. An attachment, or a boost, changes what the
instance is entitled to, which is the instances' slot: the handlers tell it through
`EntitlementEffects` (`syncEffectiveValues`), so that the usage of the instance reads the
effective value the API composes (`InstanceAppModel.applyAddonContributions`). The usage history of an
entitlement of an instance, with its exports, is
the instances': `instance-handlers.ts` serves it from `InstanceUsageHistory`
(`instance-usage-history.ts`), within what the organization keeps, with the codes of
the API. `src/__tests__/billing-subscription-mocks.test.ts`,
`usage-history-mocks.test.ts`, `billing-refusal-mocks.test.ts`,
`billing-addon-mocks.test.ts` and `billing-voucher-mocks.test.ts` read their answers off
the wire.

Stripe's connector is served by `connector-handlers.ts` over the operations of Attio's, told apart
by the name in the path (`ConnectorAppModel`: the key is write-only and redacted, a save
activates the connector after the checks the API makes in its order, the Vault, the plan, the
schema, the credentials and the account, and a deactivation is refused while a subscription or an
unsettled invoice routes to Stripe). Words in a key a spec or a person types make the mocks answer as
Stripe would (`rejected`, `offline`, `elsewhere`). Stripe is billing's provider and the
connectors' connector, so `handlers.ts` ties the two slots together when a page serves both:
connecting it in one is seen by the other, and the billing e-mail of a customer typed on its page
is the one a move to Stripe finds. `src/__tests__/billing-provider-mocks.test.ts` reads these
answers off the wire.

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
slot answers. Acme US collects through Stripe in that world (`dev-world/stripe.ts`: the history a
finance person meets, with an invoice paid in Stripe since Kaiten last read it, one whose amounts
differ, one whose push keeps failing and a held draft, and customers with a card on file), and
`?stripe=` in the address of a tab starts the connector in another state (`available`,
`connectedLive`, `notEntitled` or `vaultMissing`, `dev.ts`). `src/__tests__/dev-world.test.ts` builds that world through the
models, which check it against the contract, and checks that its references
resolve. E2E defaults unmocked platform flags off and the webhooks routes to 404
(no saas-api), answers the billing capabilities with billing off (the shell reads
them on every page; the unit network and the stories' network do the same) and
fails undeclared API requests with a network error; the shared Playwright fixture fails on the
named console error. Explicit shell fallbacks run after model owners.
Dev-world mocks warn and pass through, and partial notification mocks pass
through the business API, flags and webhooks. See the [mock policy](../../../e2e/README.md#mock-policy).

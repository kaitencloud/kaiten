# API infrastructure

`main.tsx` imports `bootstrap.ts` before the route tree. ESM evaluates that module
once; it calls `configureApiClient` to set the REST base URL and install auth/error
interceptors before route-level query keys capture the URL. The token is resolved
on every request, not captured at startup. Errors retain their HTTP status and body
through `ApiError`.

Import SDK operations/types, query options/keys and schemas from their generated
`@/api-client` entry points. The GraphQL transport is `lib/graphql-client.ts`.
There is no unified `api.rest` facade. `pagination.ts` owns cursor traversal;
`all-pages-query-options.ts` adapts generated REST operations while preserving
their query keys, and `all-billing-pages-query-options.ts` does the same for the
lists of billing (the add-on versions, the vouchers, their redemptions and the
publishable keys). Business projections belong in domains.

REST list adapters forward AbortSignal to each page request. GraphQL cancellation
is owned by its transport. Cursor traversal and response projection are separate
responsibilities from client initialization.

`fresh-write.ts` is the write of a full `PUT`: `writeOnFresh` reads the object from the
API (`FRESH_READ_OPTIONS`: no cache), restates it as a body, and sends it with only the
members the form changed on top (`mergeChangedFields`). It is generic: each entity wires
its own `GET`, `PUT` and restating function in a `save<Entity>OnFresh` of its feature or
domain. The rule, and what it does not do, is in
[forms](../../../docs/03-patterns/forms.md#updating-an-object-the-api-replaces-as-a-whole).

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

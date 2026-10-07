# Billing

What the billing screens share: whether billing exists on this deployment, what
a session may do about it, how amounts, periods and statuses read, and how a
refusal of the API is shown. The domain owns no page and no route: the screens
stay in their features, and `routes/billing/route.tsx` is the only route that
uses it today, together with the side navigation, which reads the capabilities
to decide whether to list billing at all.

The domain is built ahead of the screens that will use it, on purpose. The
invoices, the prices of a license version, the instance and customer pages, the
settings, the add-ons and the vouchers all show money and statuses and need the
same gate, so the base is written once, before the first of them, instead of
being extracted from the first screen and reworked by each one that follows. That
is why part of what `index.ts` exports has no caller yet: it is the contract
those screens are built against. The prices of a license version and the preview
of its invoice are the first to use it (`features/licenses`): the gate, the
scopes, the problem alert and the invoice preview below. The generic parts live
where any feature can reach them: `lib/money.ts`,
`components/form/fields/money-field.tsx`, `lib/download-blob.ts` and the billing
icons of `lib/data-model-icons.ts`.

## Structure

```txt
app/src/domains/billing/
├── components/       # Money, ServicePeriod, the status and line-type badges,
│                     # ProblemAlert, MissingScopeBanner, BillingUnavailable,
│                     # BillingNotFound, and the invoice preview: InvoiceLinesTable,
│                     # InvoiceTotals, InvoicePreviewResult, InvoicePreviewDialog
├── hooks/            # useCanPerform and useActionAccess, over the scopes of the session
├── logic/            # actions and their scopes, availability, problems,
│                     # statuses, invoice kinds, line types, subscription actions, periods
├── queries/          # the capabilities, the route guard, invalidation helpers
├── types/
├── __tests__/
└── index.ts
```

`lib/money.ts` formats and converts amounts, with the minor-unit exponents of
`lib/currency-exponents.ts` (the table of the API), and
`components/form/fields/money-field.tsx` types them: the helpers are generic and
`hooks/form.ts` may not import a domain. `lib/granted-scopes.ts` reads the scopes
of the session's token. `lib/download-blob.ts` saves a file the page holds, or an
export the API streams.

## Data

- `billingCapabilitiesQueryOptions` is `GET /billing/capabilities` under its
  generated key, with a 10 second timeout and no retry. `useBillingCapabilities()`
  reads it without suspending; `requireBillingCapability()` reads it in a route's
  `beforeLoad`. The read does not take the query's own abort signal: a query whose
  signal is read is cancelled when its last observer goes, which strict mode does
  on every mount, and a guard waiting on it would take that for a failure.
- `invalidateInstanceBillingQueries`, `invalidateInvoiceQueries`,
  `invalidateLicensePriceQueries` and `invalidateBillingSettingsQueries` refresh
  what a billing mutation changed, with the generated keys. A mutation of billing
  calls the helper of the thing it changed; none uses the optimistic helpers of
  `lib/optimistic-mutations.ts`, because a refusal must never show as a success.
- `OPERATION_SCOPES` (`lib/api/operation-scopes.gen.ts`) is generated from the
  `security` of each operation of `app/openapi.yaml`; `BILLING_ACTIONS` names the
  operation each action calls, and its scope is read from there.

## Behaviour

- **Billing fails closed.** It is on only when the capabilities answer
  `enabled: true`. A 403, a 404 (an API older than billing), a 503, a timeout or a
  network failure all hide billing, with no error page and no toast; what differs
  is the explanation a link to a billing screen shows (`BillingUnavailable`).
  `features.*` hides what the running release does not ship (add-ons, vouchers).
- **One guard per billing route**, in `beforeLoad`. Where billing is there, it
  lets the route load. Where it is not, it throws `notFound({ data })` with the
  closed gate, and the route's `notFoundComponent`, `BillingNotFound`, shows the
  explanation in place of the screen:

  ```tsx
  notFoundComponent: BillingNotFound,
  beforeLoad: async ({ context }) => {
    await requireBillingCapability(context.queryClient, 'addons');
  },
  ```

  The guard throws, and does not return the gate in the route context, because a
  `beforeLoad` that returns lets the `beforeLoad` and the `loader` of every route
  below it run: a screen under a closed gate would ask the API for invoices
  billing does not have. A throw stops them all, so nothing billing-related is
  requested but the capabilities. `routes/billing/route.tsx` is the first guard.
  It also answers for a path under `/billing` that is no page, so that billing
  being off never reads as a missing page. The side navigation reads the same
  capabilities: each entry of its Billing section carries a `capability`, which
  names a feature of the release when it needs one (`side-nav.constants.ts`), and
  an entry that asked for nothing is still hidden where billing is off. Load
  billing data in the route of a tab, never in the loader of the instance or the
  customer: a 403 there would blank the whole page.
- **Actions follow the scopes of the session.** `useCanPerform('invoice.markPaid')`
  is false when the token's `scopes` claim does not cover the scope the contract
  gives the operation, and false while the token is still being read.
  `useActionAccess` answers the same with `isPending`, for the screen that must
  tell "not allowed" from "not known yet": a link that is dropped when it cannot
  be followed must not be dropped before the token has been read. A token that says nothing about scopes (a session token
  whose template predates billing) offers every action: the API answers
  403 `Auth.MissingScope` to one it refuses, and `ProblemAlert` shows a banner that
  names the scope. The token is decoded for display, never verified: the API
  verifies it on every request. Reading the `scopes` claim is deliberate, and not
  at odds with `lib/feature-flags.ts`, which takes the identity of the user from
  the token table and not from its claims: that rule is about who the user is, so
  that it cannot drift when a claim is renamed, whereas the scopes exist only in
  the claim, and a wrong reading costs one refused action.
- **Money is the API's.** An amount is an integer in minor units next to a
  currency, written from its ISO 4217 exponent through BigInt, with the exponent
  the API uses for that currency; a price is a decimal string and is never
  rounded. The console adds nothing up: totals are fields of the invoice. A test
  refuses `.reduce(` in the billing code.
- **Time is UTC and half-open.** A period reads `Mar 1 – Apr 1, 2027 (UTC)`: the
  end is the instant that closes it, not the last day it covers. A boundary that
  is a day reads `Mar 1, 2027 (UTC)`.
- **A refusal shows the `detail` of the API's problem document as written.**
  There is no translation per code (`check:api-error-i18n` covers only the generic
  client categories): a problem with no `detail` falls back to a generic message
  and the `code`. What a gateway answered with, a plain text or an HTML page, is
  never shown, only the message of its status. `handleBillingProblem` recognises
  the few codes that change what a screen does: missing scope, billing off, a 503
  (nothing was changed, retry), a boundary being closed (`Retry-After`, a minute
  when absent) and usage outside the retention. `applyProblemFieldErrors` puts the
  field errors of a 422 on the fields of a form, and the problem's `detail` goes
  in a banner when one finds no field.
- **An invoice preview is shown as it came.** `InvoicePreviewDialog` is the
  shell every preview opens in: a banner that says it is a preview and not an
  invoice (`Features.Billing.InvoicePreview`), whatever the caller puts above the
  result, and a Close button, with no Save since a preview writes nothing.
  `InvoicePreviewResult` shows the invoice (its kind and when it was composed,
  `InvoiceLinesTable`, `InvoiceTotals`): the lines with their service periods,
  the arithmetic of each in the API's own words, the `capped` mark, and the
  totals, all fields of the API. A preview that disagrees with the invoice it
  predicts is a defect of the API, never something to fix up here. The caller
  brings the data: the preview of a license version is a mutation
  (`POST /licenses/{slug}/invoice-preview` is the only way to read it), and the
  upcoming invoice of an instance will be a query. A line's description is a
  sentence and a table cell does not wrap, so the line cell does.
- **NoOp is absent, not empty.** Blocks that only a Stripe invoice or
  subscription has are not rendered otherwise; a screen decides from the
  `providerKind` the API names on the invoice or the subscription.
- **Statuses read in words.** A held DRAFT says it is held and, on hover and on
  focus, why; an unpaid `SEND_INVOICE` invoice past its due date says it is
  overdue (derived: the API does not say), and `MANUAL` reads "Ready to bill",
  never as a failure. Every label map is typed `satisfies Record<Enum, string>`: a
  status the contract adds fails the type check until it has a label. A line type
  the console does not know renders as it was sent.
- **Downloads are authenticated.** An export is a stream behind a bearer token, so
  `downloadBlob` (`lib/download-blob.ts`) takes a call of the generated SDK made
  with `parseAs: 'blob'` and saves its body.

## Tests

`__tests__/` holds the unit tests of the logic, the capabilities query (the
timeout runs on fake timers), the guard and its explanation on a real router, the
components, the invoice preview, the scopes of the session
(`use-can-perform.test.tsx`, `useActionAccess` included) and the invalidation
helpers;
`billing-sources.test.ts` reads the billing code to refuse a scope written by hand
and an amount added up. `components/stories/billing-components.stories.tsx` and
`components/stories/invoice-preview.stories.tsx` show the states of the
components and run as tests. The capabilities of the mocked
console are `e2e/app/_support/model/billing-capabilities.ts`, the navigation is
covered by `e2e/app/billing/billing.navigation.spec.ts` and what a billing link
explains by `e2e/app/billing/billing.unavailable.spec.ts`.

## Public API

`index.ts` exports the components, `useCanPerform` and `useActionAccess`, the logic,
the queries and the types above. Features and routes import it as `@/domains/billing`. The domain
imports `@/domains/customer-management` for the instance invalidation, and no
feature.

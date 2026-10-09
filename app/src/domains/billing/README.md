# Billing

What the billing screens share: whether billing exists on this deployment, what
a session may do about it, how amounts, periods and statuses read, and how a
refusal of the API is shown. The domain owns no page and no route: the screens
stay in their features, and the routes under `routes/billing/` use it for the
gate (`routes/billing/route.tsx`) and for what an invoice page reads
(`BillingRouteError`, the line types), together with the side navigation, which
reads the capabilities to decide whether to list billing at all.

The domain is built ahead of the screens that use it, on purpose. The invoices,
the prices of a license version, the instance and customer pages, the settings,
the add-ons and the vouchers all show money and statuses and need the same gate,
so the base is written once, before the first of them, instead of being
extracted from the first screen and reworked by each one that follows. Part of
what `index.ts` exports may therefore have no caller yet: it is the contract the
screens still to come are built against. The prices of a license version and the
preview of its invoice (`features/licenses`) and the invoices of the organization
(`features/billing`) use it today: the gate, the scopes, the problem alert, the
invoice preview, the table of invoices, the rules of the actions of an invoice
and the way a refusal is shown. The generic parts live where any feature can
reach them: `lib/money.ts`, `lib/decimal.ts`,
`components/form/fields/money-field.tsx`, `lib/download-blob.ts` and the billing
icons of `lib/data-model-icons.ts`: an invoice, a subscription, a price, and `billing`,
the glyph of the area itself, which the Billing section of the navigation and the screens
that stand for billing as a whole (its settings, the explanation of a closed gate) draw
instead of an invoice's.

The screens that came next use it the same way. The billing tab of an instance reads
the same capabilities and refusals, lists its invoices in the same card as the page of
a customer (`InvoicesCard`), and shows its upcoming invoice, an `InvoicePreview` made
of the same lines as an invoice (`LineFingerprint`, `OverageLimits`,
`InvoiceLinesTable`); the usage history of an entitlement and the reports behind an
invoice line are drawn with the same columns (`useUsageReportColumns`) and filtered by
the same period (`PeriodFilter`); the export offered before an organization is deleted,
in the settings, is the download of the list (`downloadInvoiceExport`) through the same
menu (`ExportInvoicesMenu`); the dialog that says what keeps a record from being deleted
(`DeletionRefusalDialog`) is shared by the instances, the customers and the
entitlements; `RetryableProblem` and `BillingRouteError` are for each route that reads
one record. Three things have only `features/billing` as their caller today, and sit
here beside the statuses they read: `getInvoiceActions` with
`useInvoiceActionAccess` (what an invoice allows), `isHandoffLeased` and
`readRecomposeRefusal`. They move to the feature if no other screen needs them.

## Structure

```txt
app/src/domains/billing/
├── components/       # Money, ServicePeriod, the status, provider and line-type badges,
│                     # ProblemAlert, BoundaryClosingNotice, RetryableProblem, MissingScopeBanner,
│                     # BillingUnavailable, BillingActionDialog and ReasonDialog (the dialogs that
│                     # ask the API for an audited action: a release of a hold, the void of an
│                     # invoice, the revocation of a redemption),
│                     # BillingNotFound, BillingRouteError, InvoicesTable (its columns in
│                     # invoices-table-columns) and its cells, the
│                     # fingerprint and the arithmetic of a metered line (LineFingerprint,
│                     # OverageLimits), the invoice preview: InvoiceLinesTable,
│                     # InvoiceTotals, InvoicePreviewResult, InvoicePreviewDialog, what a
│                     # feed the server pages is drawn with (paged-list/: the skeleton, the empty
│                     # state, the foot), the invoices of one subject in a card (InvoicesCard),
│                     # the period of a list (PeriodFilter), the columns of a table of usage
│                     # reports (useUsageReportColumns), the menu of the export of the invoices
│                     # (ExportInvoicesMenu, which says which filters of its screen the file
│                     # leaves out), the dialog of a refusal to delete
│                     # (DeletionRefusalDialog), the amount of a price (PriceAmount), and what
│                     # the versions of a license and those of an add-on share: the confirmed
│                     # lifecycle action, the deletion of a draft, the badge of the state and
│                     # the looks of a row's actions (VersionLifecycleAction,
│                     # VersionDraftDeleteAction, VersionLifecycleBadge, ROW_ACTION_LOOKS), and
│                     # what the screens of the vouchers and of the instances share: the badges
│                     # of a voucher and of a redemption (voucher-badges), the redemptions of a
│                     # voucher or of an instance as a table and as a card (RedemptionsTable,
│                     # RedemptionsCard), the dialog that revokes one (RevokeRedemptionDialog), the
│                     # explanation of a DISCOUNT line (InvoiceLineDiscount) and what a table says
│                     # when it has no row (TableEmptyMessage)
├── hooks/            # useCanPerform and useActionAccess, over the scopes of the session
│                     # (useGrantedScopes reads them, for a screen that filters on several);
│                     # useInvoiceActionAccess, the same for the five actions on an invoice;
│                     # useAlertFocus, which puts the focus on a refusal or a confirmation; useDeletionRefusal,
│                     # which explains a deletion billing refused; useBillingActionForm, the form of an
│                     # audited action; useBoundaryRetry, which waits
│                     # out a period being closed; useExportInvoices;
│                     # useUsageReports, over the pages of a list of usage reports
├── logic/            # actions and their scopes, availability, problems, the placing of a
│                     # refusal on the fields of a form (problem-field-errors), the reason an
│                     # audited action takes (reason), statuses,
│                     # invoice kinds, line types, invoice actions, the refusals of a
│                     # recompose and of a deletion, handoff, export, retention, usage reports,
│                     # subscription actions, whether a subscription is live (isSubscriptionLive),
│                     # billing periods, the trial of a subscription, the state of a voucher and of a
│                     # redemption read from their window and their count (voucher-status), and what a
│                     # voucher does in plain language (voucher-offer),
│                     # and what a price is called and how its amount is written
│                     # (price-types, price-labels, price-display)
├── queries/          # the capabilities, the billing settings, the route guard, invalidation
│                     # helpers (those of the vouchers and of an instance's redemptions included),
│                     # the pages of the invoices of a subject, the pages of usage reports, the
│                     # export of the invoices
├── types/
├── __tests__/
└── index.ts
```

`lib/money.ts` formats and converts amounts, with the minor-unit exponents of
`lib/currency-exponents.ts` (the table of the API), and
`components/form/fields/money-field.tsx` types them: the helpers are generic and
`hooks/form.ts` may not import a domain. `lib/decimal.ts` writes and adds the
decimal strings the API carries quantities in, digit for digit. `lib/granted-scopes.ts`
reads the scopes of the session's token. `lib/download-blob.ts` saves a file the
page holds, or an export the API streams.

## Data

- `billingCapabilitiesQueryOptions` is `GET /billing/capabilities` under its
  generated key, with a 10 second timeout and no retry. `useBillingCapabilities()`
  reads it without suspending; `requireBillingCapability()` reads it in a route's
  `beforeLoad`. The read does not take the query's own abort signal: a query whose
  signal is read is cancelled when its last observer goes, which strict mode does
  on every mount, and a guard waiting on it would take that for a failure.
- `invoicesQueryOptions(filters)` reads every invoice the filters select (none: every
  invoice of the organization), 200 at a time by the cursor the API returns until it
  says there is no more, through `allInvoicesOptions` of `lib/api`: the table sorts and
  pages what was read, like every list of the console. It keeps the generated key of
  the list with the filters in it, so that a helper that invalidates the invoices
  reaches every list by prefix, whatever it was read for (the page of the
  organization, the card of a customer). It is not retried, and a refusal that the
  route's loader met is the answer, not asked again when the screen mounts. The card
  of an instance reads its own operation the same way
  (`allInstanceInvoicesOptions`, in `features/instances`).
  `billingSettingsQueryOptions` is `GET /billing/settings` (the defaults a subscription
  takes), read by the settings page and by the dialog that subscribes an instance.
- `usageReportPagesQueryOptions({ fetchPage, queryKey })` reads usage reports a page at a
  time by report number (`afterSeq`: the API answers with the number to read after, and
  none on the last page), under the generated key of the operation with an `_infinite`
  marker, never retried: the reports behind an invoice line and the usage history of an
  entitlement of an instance are read through it, and `useUsageReports(query)` gives
  what a screen reads off the pages (the reports, the ones where the limit moved, and
  whether the period reaches before what is kept, which is an answer and not a failure).
- `downloadInvoiceExport(variant, filters)` exports the invoices a list selects (a
  call of the generated SDK with `parseAs: 'blob'`, handed to `downloadBlob`); the
  query of each variant and the name of its file are `toInvoiceExportQuery` and
  `invoiceExportFilename`. A screen that filters in the browser gives
  `ExportInvoicesMenu` the filters the API has too, and the names of the ones it has
  not (`unapplied`): the menu says so above its choices, since the file would hold
  invoices the screen does not show.
- `invalidateInstanceBillingQueries`, `invalidateInstanceAddonQueries`,
  `invalidateInvoiceQueries`, `invalidateLicensePriceQueries` and
  `invalidateBillingSettingsQueries` refresh what a billing mutation changed, with the
  generated keys. The add-ons an instance holds apply to its entitlements at once, so
  changing them (`invalidateInstanceAddonQueries`) refreshes the add-ons of the
  instance, the effective values its entitlements show and the invoice its next
  boundary will issue. A mutation of billing
  calls the helper of the thing it changed; none uses the optimistic helpers of
  `lib/optimistic-mutations.ts`, because a refusal must never show as a success.
- `OPERATION_SCOPES` (`lib/api/operation-scopes.gen.ts`) is generated from the
  `security` of each operation of `app/openapi.yaml`; `BILLING_ACTIONS` names the
  operation each action calls, and its scope is read from there. It lists what the
  screens offer on a subscription (`subscription.cancel`, `.reactivate`,
  `.schedulePlanChange`, `.cancelPlanChange`, `.updateTerms`), the operations of an
  instance on the add-ons it holds (`instance.addons.list`, `.attach`, `.setQuantity`,
  `.detach`, and `instance.update` beside a cancellation: the scopes of the instances,
  not of billing), the catalogue of add-ons (`addons.*`, `addonFamily.setPublic`,
  `addonGrants.*`, `addonPrices.*`, `addonCompatibility.*`, whose scopes are the add-ons'),
  what the screens of the catalogue read of the licenses and the entitlements
  (`licenseFamilies.list`, `licenseGrants.list`, `entitlements.list`, `instances.list`)
  and the public listing of a family of licenses (`licenseFamily.setPublic`).

## Behaviour

- **Billing fails closed.** It is on only when the capabilities answer
  `enabled: true`. A 403, a 404 (an API older than billing), a 503, a timeout or a
  network failure all hide billing, with no error page and no toast; what differs
  is the explanation a link to a billing screen shows (`BillingUnavailable`).
  `features.*` hides what the running release does not ship (add-ons, vouchers), and
  the console has the screens of the add-ons, behind `features.addons`.
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
  an entry that asked for nothing is still hidden where billing is off. An entry may
  also name an `action`, and is then listed only to a session whose scopes cover it
  (the add-ons are not offered to a session that may not read them), once the token has
  been read. Load
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
- **A subscription that lives takes add-ons.** `isSubscriptionLive` says whether a
  subscription is in a trial, active or past due: the states in which an add-on can be
  attached to an instance and is billed from the next boundary. An instance nobody
  bills, or whose subscription ended, takes none beside the dialog that starts one.
- **Money is the API's.** An amount is an integer in minor units next to a
  currency, written from its ISO 4217 exponent through BigInt, with the exponent
  the API uses for that currency; a price is a decimal string and is never
  rounded. The console adds nothing up: totals are fields of the invoice. A test
  refuses `.reduce(` in the billing code.
- **Time is UTC and half-open.** A period reads `Mar 1 – Apr 1, 2027 (UTC)`: the
  end is the instant that closes it, not the last day it covers. A boundary that
  is a day reads `Mar 1, 2027 (UTC)`, and the time of day is added only when a
  boundary is not at midnight. A cell that gives the day on one line writes the
  time under it with `formatUtcTime` (`10:00 AM (UTC)`), and a screen that sets the
  zone in smaller type beside a figure, as the strip of an invoice does, takes the
  marker off with `splitUtcMarker`.
- **A refusal shows the `detail` of the API's problem document as written.**
  There is no translation per code (`check:api-error-i18n` covers only the generic
  client categories): a problem with no `detail` falls back to a generic message
  and the `code`. What a gateway answered with, a plain text or an HTML page, is
  never shown, only the message of its status. `handleBillingProblem` recognises
  the few codes that change what a screen does: missing scope, billing off, a 503
  (nothing was changed, retry), a boundary being closed (`Retry-After`, a minute
  when absent, see below) and usage outside the retention. `applyProblemFieldErrors` puts the
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
- **What an invoice allows is decided here.** `getInvoiceActions(invoice, context)`
  answers, from the status, the hold and the replacement of an invoice, which of
  release, recompose, mark paid, write off and void it offers, in order, and
  `INVOICE_ACTION_SCOPES` names the billing action, hence the scope, of each, and
  `useInvoiceActionAccess` reads them once for a screen. An
  action the status allows and the screen knows the API would refuse is returned
  disabled, with why: a recompose of a void invoice whose usage is no longer kept
  (`getRetentionStart(months)` from `usageHistoryRetentionMonths`, which a held draft
  is exempt from) and one for an instance that was deleted. The API has the last
  word. `isHandoffLeased` says whether a consumer holds an invoice of the handoff
  queue, from its lease; an expired lease is as good as none.
  `readRecomposeRefusal` reads what a recompose was refused for when the refusal
  changes what is offered next (the invoice has to be voided first, its
  replacement already exists and is named, its instance was deleted): the codes
  and the replacement the problem carries are read here, once, and the dialog
  switches on the result.
- **A metered line shows what it was measured from.** `LineFingerprint` writes the
  `metering.ledger` of a line (`Reports 41–45 · 5 rows · Σ 172,345`) and
  `OverageLimits` the arithmetic of an overage line with every limit that applied,
  as the API sent them. Neither is shown for a base fee, an add-on or a discount.
- **A table of invoices is one table.** `InvoicesTable` is the table of the
  organization, of an instance and of a customer: a screen leaves out the columns
  it already says (`hiddenColumns`, the same array from one render to the next,
  since the columns are built from it), and a row leads to its invoice. The list is
  read whole, so the browser sorts it, by who the invoice is for, the boundary it
  bills (newest first, as the table opens), the service period, the total and the
  due date (an invoice that was not issued has none and goes last), and pages it ten
  to a page like every table of the console. A total sorts by currency first and by
  amount within one (`compareInvoiceTotals`): an amount is in the minor units of its
  own currency, so two currencies' amounts are never compared, and none is
  converted. `InvoiceCustomerCell`, `InvoiceKindCell` and `InvoiceTotalCell` are the
  cells every table of invoices has, the handoff queue's included,
  `rightAlignedHeader` the header of a column of amounts and
  `rightAlignedSortableHeader` the one of an amount that sorts, whose arrow ends where
  the digits do. The service period is stacked, its start above its end
  (`ServicePeriod` with `stacked`), since a subscription that bills from the middle
  of a day writes the time of day on both ends and that is wider than any other
  column, and the handoff label wraps, so that the eight columns fit the width of a
  laptop with the side navigation open.
- **A feed the server pages draws the same states.** The usage reports behind an
  invoice line and the usage history of an entitlement are streams of events, which
  stay paged by the API: `PagedListSkeleton` while the first page is on the way,
  `ListEmptyState` when there is no row, and `LoadMoreFooter` under the rows, as the
  notifications feed draws its own: a centred "Load more" while there is a next page,
  and a refusal of the next page above it. It never says how many rows were read: the
  API does not say how many there are, and the count of a page reads as the count of
  the list. The skeleton and the empty state also serve the card of invoices and the
  card of an instance that nobody bills.
- **A refusal is shown where the person is looking.** `placeRefusalOnFields` shows a
  refusal of the API on the field of a form it is about, for the forms of the dialogs
  that ask for an audited action and those that follow.
- **A refusal on a field goes when the field changes.** `setProblemFieldError` shows
  the API's words on one field (`errorMap.onServer`, the code of the refusal beside
  the message for what is drawn under the field), remembers the value it was shown
  for, and takes the error back as soon as the field holds another: a refusal is about
  what was typed, and a form that stayed invalid after the person fixed it would not
  let them send it again. A newer refusal on the same field replaces the older, and one
  stands while the value does not change even when the field leaves the screen and is
  drawn again, as the fields of a wizard do between its steps (a field drawn again starts
  its state over, and the refusal is put back). `clearProblemFieldError` takes it back
  before any change, for a refusal about what several fields say together (a short code
  that nothing bounds), which the person fixes by changing another field.
  `applyProblemFieldErrors` and `placeRefusalOnFields` place a problem on the fields
  that its locations or its code name, and answer whether every error found one.
- **A period being closed is waited out once.** Every write to a live subscription
  (cancel, reactivate, schedule or drop a plan change, change the payment terms) is
  refused with a 409 `*.BoundaryPending` while the period it ended is being closed:
  nothing was changed, and a minute later the close has run. `useBoundaryRetry()`
  gives a screen `send(request)`: it makes the request, and on that refusal it waits
  what `Retry-After` says (a minute when the API says nothing, which today it does not),
  makes the very same request once more, and says `closing` meanwhile, for the screen to
  show `BoundaryClosingNotice` (a status, not an error) in place of an alert. If the
  second try fails, whatever the reason, the failure is thrown for the screen to show
  as any other refusal, with a Retry (`ProblemAlert` offers it for this kind as for a
  503) that starts a new `send` with a retry of its own. Leaving the screen during the
  wait drops the retry: nobody is looking at the outcome any more, and a request
  nobody asked for again is not sent.
- **A trial has the bounds the console puts on it.** The API takes a trial in days
  with no upper bound, and a number of days that overflows its duration is refused as
  an error of the server, so the console bounds the field itself (`MAX_TRIAL_DAYS`,
  365: the same bound as the payment terms; `isValidTrialDays`). Only a price billed in
  advance has a trial (`canStartWithTrial`): the trial of a price billed in arrears
  cannot be closed yet, so the console does not offer one. `getTrialEnd` says when a
  trial of so many days ends, counted in whole days from the start as the API counts
  it, for the summary of the dialog that subscribes: it says when, and never how much.
- **A billing period is counted as the API counts it.** `addMonthsClamped` moves a
  date by whole months in UTC with the day clamped to the last of the month (Jan 31
  plus a month is Feb 28), so that a boundary the console shows is the instant the API
  composes the invoice at. `getSubscriptionStartBounds` gives the instants a
  subscription may start at (from one period ago to now) and `getFirstInvoiceTiming`
  says when the first invoice is issued: at once for a price billed in advance, at the
  end of the first period for one billed in arrears. They say when and never how much:
  only the API composes an invoice.
- **A price reads the same wherever it is shown.** The enums of a price (`BillingModel`,
  `BillingPeriod`, `BillingTiming`), the words they read as (`price-labels`: the label
  and the blurb of a shape or a timing, a period and what follows an amount over it,
  the status, the unit a metered price resets on, under `Features.Billing.Price` in
  both languages) and the way an amount is written (`getPriceAmountParts`,
  `joinPriceAmount`, `getPriceLabel`, `getPriceUnitLabel`) are the domain's. The prices
  of a license version, which are edited in `features/licenses`, and the subscription
  of an instance, which is pinned to one of them in `features/instances`, are drawn
  from the same code. A decimal string of minor units is written with every decimal it
  has, a metered price is per sale unit, and none is ever added to another.
- **A version of a license and a version of an add-on live the same life.** A draft goes
  on sale, a published version is withdrawn, an archived one goes back on sale, and a
  family's default cannot be archived (`getVersionTransition`, `isDefaultArchiveBlocked`).
  The confirmation, the disabled action with its reason, the looks and the badge are
  shared; each feature brings its words, the permission it asks and the operation it
  runs. What an add-on is called where it is chosen (`getAddonTitle`) and what the
  screens of the add-ons and the Billing tab of an instance both read about a version
  (`addonPricesQueryOptions`, `addonCompatibilityQueryOptions`,
  `addonLicenseFamiliesQueryOptions`) are the domain's too.
  The transitions a thing goes through may be fewer than three: a voucher is published and
  archived and never put back on sale, so `VersionLifecycleAction` and
  `VersionLifecycleKeys` are generic over the transitions they say, and the block that
  stops the archiving of a default is optional.
- **A voucher is read from its window, not from the status the API stores.** The API never
  sets a voucher EXPIRED, and an ACTIVE voucher stays ACTIVE past its end until the
  redemption that reaches its maximum flips it to EXHAUSTED, so `getVoucherStatus` reads an
  ACTIVE voucher as exhausted when its count reached its maximum (the API tests it first),
  expired when its `expiresAt` is not after now, and active otherwise; `isVoucherScheduled`
  says that one that starts later cannot be redeemed yet. A redemption of a boost stays
  ACTIVE past its end for the same reason, and `getRedemptionStatus` reads it as expired.
  `VoucherStatusBadge` and `RedemptionStatusBadge` draw that status, never the stored one.
- **A voucher is described by what it does, counted in the unit it lasts in.**
  `describeVoucherOffer` writes the discount and what it applies to, or what the boost
  changes, and for how long: a discount counts invoices and a boost billing periods, which
  diverge once an instance changes plan. It reads from a stored voucher and from the draft
  of the wizard alike, so the sentence an account executive pastes in an e-mail is the one
  the review step showed. `describeDiscount` and `describeGrant` are its two parts.
- **The redemptions of a voucher and of an instance are one table.** `RedemptionsTable`
  leads each row by the instance (on the page of a voucher) or by the voucher (on the page
  of an instance) and shows when it was redeemed, the window it applies in, the invoices a
  discount used and its state, with the reason a revoked one was; `RedemptionsCard` draws
  its four states (loading, refused with a way to ask again, empty, populated).
  `RevokeRedemptionDialog` takes one back with the reason the API requires, waits out a
  period being closed, and refreshes the voucher, its redemptions, the instance and its next
  invoice (`invalidateInstanceVoucherQueries`).
- **A DISCOUNT line explains itself from what the API records on it.** The amount is the
  line's own (negative, in minor units); `InvoiceLineDiscount` adds how it was worked out (a
  percentage of what its targets still amounted to, or an amount), which invoice of its
  redemption it is out of how many, and what each target bears. The label of a line is
  never parsed. `InvoiceTotalCell` and the strip of an invoice say what the discounts
  took off from `discountTotal`, which the API states.
- **A refusal to delete says what stands in the way.** `readDeletionRefusal` reads the
  409 of the deletion of an instance (`DeleteInstance.BillingActive`), of a customer
  (`DeleteCustomer.BillingActive`) and of an entitlement
  (`DeleteEntitlement.InUseConflict`) from the problem's `errors[0].value`: the status
  of the subscription and the invoices not settled, whether a subscription lives, or
  what still grants, counts or prices the entitlement. `useDeletionRefusal(slug)`
  answers whether a failure was one and, if so, holds the dialog to render beside the
  action, with the links to the subscription, the invoices and the record; any other
  failure keeps its toast. A list whose rows leave it before the API has answered (the
  entitlements) holds the hook above its rows and names the record on each call,
  `showRefusal(error, slug)`, since a dialog kept by a row goes with the row. Nothing was deleted, and the dialog says so. A price and a
  voucher boost are never deleted through the API, so an entitlement held by one
  (`hasPermanentReference`) is not asked to be freed: the dialog offers to hide it
  instead, by turning off its "User facing" option.
- **Usage outside the retention is not a failure.** The API refuses a period that
  starts before the usage it keeps with `OutsideRetention` and the start of what it
  keeps as a bare ISO string in `errors[0].value` (the line of an invoice carries an
  object, the metering). `handleBillingProblem` reads both into `retentionStart`; the
  usage history says how long usage is kept, when the capabilities tell, and offers
  to start where it begins, and the export of the usage of the organization reads its
  oldest month from there.
- **Reading a billing route fails visibly.** `BillingRouteError` is the
  `errorComponent` of the routes of one record: the API's words, a banner for a
  missing scope, a page that does not exist for a 404, and a Retry that invalidates
  the router (the `reset` of an error component only clears the boundary, which
  throws the same error again). `RetryableProblem` is the same for a read inside a
  page: the refusal and a way to ask again, none where it would change nothing (a
  missing scope, a period whose usage is no longer kept).
  `ProblemAlert` takes `autoFocus` for a dialog, whose confirmation is disabled
  while the API answers and drops the focus with it.
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
and an amount added up. `components/stories/billing-components.stories.tsx`,
`components/stories/invoice-preview.stories.tsx`, `deletion-refusal-dialog.stories.tsx`,
`usage-reports.stories.tsx` and `invoices-card.stories.tsx` show the states of the
components and run as tests. The capabilities of the mocked
console are `e2e/app/_support/model/billing-capabilities.ts`, the navigation is
covered by `e2e/app/billing/billing.navigation.spec.ts` and what a billing link
explains by `e2e/app/billing/billing.unavailable.spec.ts`. The table of invoices,
the fingerprint, the arithmetic of an overage, the refusals (`retryable-problem`,
and `invoice-refusals` for what a recompose was refused for), the rules of the
invoice actions and the scopes that gate them, the export and the lease of a
handoff have their own files in `__tests__/`, and the voucher status
(`voucher-status.test.ts`), the plain-language offer (`voucher-offer.test.ts`), the
redemptions table and its revoke dialog (`redemptions.test.tsx`) and the discount line
(`invoice-line-discount.test.tsx`) have theirs, and
`components/stories/invoices-table.stories.tsx` shows the table. The wait for a
period being closed (`use-boundary-retry.test.tsx`, on fake timers: the minute, the
`Retry-After`, the single retry, the unmount) and the bounds of a trial
(`trial.test.ts`) are tested there too. The screens built on the domain are tested in
[`features/billing`](../../features/billing/README.md).

## Public API

`index.ts` exports the components, `useCanPerform` and `useActionAccess`, the logic,
the queries and the types above. Features and routes import it as `@/domains/billing`. The domain
imports `@/domains/customer-management` for the instance invalidation, and no
feature.

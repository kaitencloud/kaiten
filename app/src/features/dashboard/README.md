# Dashboard

The dashboard is the landing page of the console: what needs attention today, the figures of the organization and the standing of every instance, on two tabs for two readers. **Customers** speaks to the people who sell and support: customer names, plain sentences, the lever beside each line. **Integration** speaks to the people who wired Kaiten in: usage reports accepted and refused, the instances that report and read, the flags evaluated, the zones behind the latest release, the tokens about to expire. Both read one summary that the API computes over the whole organization.

## Routes

| Path         | Route file                           |
| ------------ | ------------------------------------ |
| `/dashboard` | `app/src/routes/dashboard/index.tsx` |

`/` redirects to `/dashboard` (`app/src/routes/index.tsx`), and the dashboard is the first entry of the side navigation (`topLevelRoutes` in `app/src/routes/-components/side-nav/side-nav.constants.ts`).

The tab and the period travel in the address: `?view=customers|integration` and `?range=7d|30d|90d` (`app/src/features/dashboard/search.ts`). The defaults, `customers` and `30d`, are stripped, so `/dashboard` stays `/dashboard`. The route's loader has the summary of the period ready before the page draws, and the page reads it with Suspense; the error state is the route's error component, with its retry.

## Structure

```txt
app/src/features/dashboard/
├── components/
│   ├── dashboard-page.tsx        # header, period control, the two tabs
│   ├── customers-view.tsx        # the Customers tab
│   ├── integration-view.tsx      # the Integration tab
│   ├── attention-card.tsx        # the lines of what needs attention, and what was checked
│   ├── figures-row.tsx           # the row of five figures (StatCard)
│   ├── fleet-card.tsx            # every instance with its standing and its worst meter
│   ├── signals-cards.tsx         # growth and risk, in sentences
│   ├── license-mix-card.tsx      # instances per license family and version
│   ├── coming-up-card.tsx        # the licenses ending within 180 days
│   ├── billing-card.tsx          # subscriptions and this month's invoices, where billing is on
│   ├── usage-reports-card.tsx    # reports per day (chart) and per instance (table)
│   ├── flag-evaluations-card.tsx # evaluations per flag, and the flags nobody evaluates
│   ├── zones-card.tsx            # deployment zones and the release each one runs
│   ├── integrations-card.tsx     # service accounts, tokens, publishable keys, connectors
│   ├── recent-changes-card.tsx   # the audit trail, filtered for the tab
│   ├── range-control.tsx         # 7, 30 or 90 days
│   ├── standing-badge.tsx
│   └── stories/dashboard.stories.tsx
├── logic/
│   ├── attention.ts              # the summary → the attention lines of each tab
│   ├── standing.ts               # the summary → one standing per instance
│   └── format.ts                 # counts, quantities, days
├── queries/dashboard-summary.ts  # dashboardSummaryQueryOptions(range)
├── search.ts                     # the ?range= and ?view= of the address
└── index.ts
```

The files of `logic/` are pure functions over the summary. The components receive what they draw as props; only `recent-changes-card.tsx` and `customers-view.tsx` read a query of their own.

## Data

**One request, computed by the API.** `GET /dashboard/summary?range=7d|30d|90d` (`getDashboardSummary`, `app/src/features/dashboard/queries/dashboard-summary.ts`) answers the whole dashboard: the attention checks, the figures, the meters closest to their limit, the usage reports per day and per instance, the flags evaluated, the license mix and the licenses ending, the deployment zones, the integrations and billing. The API counts every row of the organization, so no figure is the first page of a list. The query spreads the options the generated client builds, so its key is the generated one with the period in it; it stays fresh for a minute, and nothing invalidates it.

**What the session may read.** The summary needs `read:customers`, `read:instances` and `read:licenses`, the three the home is made of. The other blocks follow the session's scopes: `featureFlags` and `billing` are absent when the session cannot read them, `zones` is empty, `integrations` carries only the parts the session may read (`tokens`, `publishableKeys`, `connectors`), the subscription facts of a License ending (`billingStatus`, `cancelAtPeriodEnd`) are blank without `read:billing`, and `attention.checked` names only the checks that ran. The views draw what is there and the attention card says what was checked. Billing figures appear when the summary carries them and billing is offered to the session (`useBillingScreenOffered`, `@/domains/billing`); the Customers tab then also reads the billing health (`billingHealthQueryOptions`) for its attention lines.

**Recent changes.** The last card of each tab reads the organization's audit trail (`globalAuditTrailQueryOptions`, `@/domains/audit-trail`), the last 100 events once the API has left out the reads, evaluations and reports that make up the bulk of a busy trail (`changesOnly`), so SDK traffic cannot empty the page, and keeps the commercial ones on Customers (customers, instances, licenses, subscriptions, invoices) and the technical ones on Integration (tokens, keys, connectors, releases, zones, flags). It draws without them when the audit trail fails.

## Behaviour

- **Period.** The period applies to what is counted over time: customers and instances created, instances active or silent, usage reports accepted and refused, flag evaluations, the chart of reports per day. The attention checks keep their own horizons whatever the period: refused reports over the last 24 hours, licenses and tokens ending within 30 days.
- **Standing of an instance** (`logic/standing.ts`): computed by the API over every meter of the instance, and carried by each row of `usageReports.byInstance` with the meter behind it (`standing`, `headline`). _At limit_ when a meter reached the most its grant allows (a hard limit, or a soft limit with its allowance used up): the next report is refused. _Watch_ when a meter is at or past the warning threshold of its grant, as the report path warns; an entitlement with no threshold never is. _Silent_ when the instance neither reported usage, accepted or refused, nor read an entitlement in the period. _Healthy_ otherwise. A meter at its limit ranks before one above its threshold, whatever their ratios. The fleet card lists every instance with its standing; the figures count the standings the API counted over the whole organization (`figures.instances.byStanding`). A periodic meter reads its current window, as the usage endpoints do: a window that closed without a report reads 0.
- **Attention lines** (`logic/attention.ts`): one line per finding, with its count and the page to act on. Customers: instances at a limit, near a limit, silent, not healthy, licenses ending within 30 days, instances on an archived version, subscriptions past due and invoices overdue where billing is on. Integration: refused reports, silent instances, zones behind the latest release, tokens expiring within 30 days, flags nobody evaluates. A tab with nothing to say lists what was checked and when.
- **Figures.** Customers: customers, instances (active in the period), instances at a limit, licenses ending within 180 days and, where billing is on, the amount invoiced this month; usage reports accepted otherwise. Integration: usage reports accepted and refused, instances that reported, flag evaluations, active tokens.
- **Layout.** The cards stack in one column below `xl` and sit in two columns from `xl` up; the figures keep three columns from `md` and five from `xl` (`md:grid-cols-3 xl:grid-cols-5`).

## Tests

- Stories: `app/src/features/dashboard/components/stories/dashboard.stories.tsx` (`Features/Dashboard/P0DashboardStories`): the Customers and Integration tabs on a busy day, a quiet day and an empty organization, fed by the summary builders of `app/e2e/app/_support/model/dashboard-summary.ts`.
- E2E: `app/e2e/app/dashboard/dashboard.read.spec.ts` checks the redirect from `/`, the attention lines, the fleet, the Integration tab, the period in the address and the error state; its scenarios are in `app/e2e/app/dashboard/dashboard.scenarios.ts` and the mocked endpoint in `app/src/e2e/msw/dashboard-handlers.ts`. Other specs render the page too: `app/e2e/app/accessibility/accessibility.spec.ts` runs WCAG checks on it, `app/e2e/app/mobile/mobile.read.spec.ts` uses a phone-sized viewport and `app/e2e/app/i18n/i18n.locale.spec.ts` switches it to French.

## Public API

`app/src/features/dashboard/index.ts` exports `DashboardPage`, `dashboardSummaryQueryOptions`, `readDashboardSearch` and the defaults of the search. Only `app/src/routes/dashboard/index.tsx` imports them, as routes are the only importers of a feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)). The cards and the logic are internal to the feature.

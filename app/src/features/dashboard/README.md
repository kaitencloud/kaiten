# Dashboard

The dashboard is the landing page of the console. It summarizes the organization in six figures, three insight cards and nine charts: customers and instances, license expiry, entitlement saturation, feature flags, releases and deployment zones, and service accounts with their tokens. Every figure is computed in the browser from lists the API returns.

## Routes

| Path | Route file |
| --- | --- |
| `/dashboard` | `app/src/routes/dashboard/index.tsx` |

`/` redirects to `/dashboard` (`app/src/routes/index.tsx`), and the dashboard is the first entry of the side navigation (`topLevelRoutes` in `app/src/routes/-components/side-nav/side-nav.constants.ts`). The route has no loader: it lazy-loads the feature with `React.lazy`, and the page starts its own requests when it renders.

## Structure

```txt
app/src/features/dashboard/
├── components/
│   ├── dashboard-page-content.tsx   # layout, loading and error states
│   ├── cards/                       # six-figure row and three insight cards
│   ├── charts/                      # the nine charts and their shared helpers
│   └── stories/                     # stories and their fixtures
├── hooks/
│   ├── use-dashboard-metrics.ts     # memoizes buildDashboardMetrics
│   └── dashboard-metrics*.ts        # pure builders: one per group of charts, plus types and helpers
├── queries/
│   ├── dashboard.queries.ts         # GraphQL documents (GetDashboardData feeds the page)
│   └── use-dashboard-data.ts        # the base query and the supplementary REST query
├── utils/                           # chart-configs.ts: one ChartConfig per Recharts chart (labels, colours)
└── index.ts
```

Only `use-dashboard-metrics.ts` in `hooks/` is a React hook. The other files are plain functions that turn the fetched lists into a `DashboardMetrics` value (`summary` figures and `charts` series), which is what the cards and charts receive as props.

### Charts

- Each chart is wrapped in `ChartShell` (`@/components/ui/chart-shell`, re-exported by `app/src/features/dashboard/components/charts/chart-shell.tsx`) and renders `ChartEmptyState` (`@/components/chart-empty-state`) when its series is empty.
- The Recharts charts use `ChartContainer`, `ChartTooltip` and `ChartTooltipContent` from `@/components/ui/chart`, and `ChartLegend` and `ChartLegendContent` when they show a legend. The entitlement saturation chart is an HTML grid, not a Recharts chart.
- Series labels and colours come from `app/src/features/dashboard/utils/chart-configs.ts`, and the line strokes read them as `var(--color-<seriesKey>)`. Bar and slice fills are computed by the metric builders from the theme's `--chart-1` to `--chart-5` tokens, and from `TOKEN_STATE_FILLS` for the token states.
- The six figures and the three insight cards under them use `StatCard` ([stats cards](../../../docs/03-patterns/stats-cards.md)).

## Data

The page reads two queries:

- **Base query, GraphQL.** `useDashboardData` runs `GetDashboardData` (`app/src/features/dashboard/queries/dashboard.queries.ts`): customers, instances with their license, and licenses. Its query key is `['dashboard']`. While it loads the page shows a loading message under its title, and if it fails an error message, with no retry action.
- **Supplementary query, REST.** `useDashboardSupplementaryData` starts once the base query has data. Through the generated client it lists instances, licenses, feature flags, releases, deployment zones and service accounts, then, for each service account its tokens, for each license its entitlements, and for each instance its entitlement usage (`GET /instances/{instanceSlug}/entitlements/usage`). It does not retry and stays fresh for 60 seconds. Its key holds the number of instances and licenses of the base query, so it runs again when either count changes.

The supplementary query is best effort. Every request goes through `safeFetchArray`, which turns a failure or an unexpected body into an empty list, so a failing endpoint empties its charts and never breaks the page. While the query runs, a line at the bottom reads "Refreshing supplemental insights...".

No request passes `limit` or a cursor, so each paginated list is read as a single page of 50 rows, the API's default. In an organization with more rows than that, the figures count that first page.

When the REST list of instances, or of licenses, is not empty, it replaces the GraphQL rows in the metrics. Otherwise the GraphQL rows are used.

The feature has no mutation, nothing invalidates its queries and nothing polls them. Once stale, a query refetches when the page mounts again or the window regains focus. The stale time is 30 seconds by default (set in `app/src/main.tsx`) and 60 seconds for the supplementary query.

## Behaviour

- **Instances.** The "Active Instances" figure counts every instance the API returns, with no status filter.
- **License expiry.** Days remaining are `ceil((end date - now) / one day)`. An instance whose license ended at least a day ago, or has no end date, is not counted. The two expiry figures count the instances ending within 30 and 60 days. The forecast chart buckets them into 0-7, 8-30, 31-60, 61-90 and more than 90 days.
- **Top customers.** The eight customers with the most instances.
- **Instance lifecycle timeline and release cadence.** Monthly series without gaps: instances created, started and ending per month, and releases created per month.
- **Release coverage.** The six releases deployed in the most zones, plus one bar for the zones without a release. The release coverage insight card shows how many zones have a release out of all zones.
- **Feature flags.** Enabled against total, the split by flag type, and the number of targeting rules per flag in the buckets 0, 1, 2, 3 and 4 or more.
- **Tokens.** A token is revoked, without expiry, expired, expiring soon (expires within 30 days) or healthy. The "expiring soon" figure counts the tokens in that state, and "active tokens" counts every token that is not revoked, expired ones included.
- **Entitlement saturation.** Only numeric usages are banded. The ratio is the usage over the most the grant allows: the granted value, plus the overage percentage when the limit is soft. A usage with no numeric cap falls in "no limit". The other bands are under 50%, 50-80%, 80-100% and over 100%. Rows are grouped by license type and usage scope, lifetime before periodic. The entitlement insight card counts the usages in the 80-100% band, how many of those are periodic (they clear at the next reset) and, in its description, the usages over 100%.
- **Layout.** The charts stack in one column below the `xl` breakpoint and sit on a 12-column grid from `xl` up.

The code that decides each figure is in `app/src/features/dashboard/hooks/`.

## Tests

- Unit (Vitest), in `app/src/features/dashboard/hooks/`: `dashboard-metrics.charts.test.ts` (expiry buckets, top customers, flags, release coverage), `dashboard-metrics.helpers.test.ts` (dates, monthly series, token states) and `__tests__/dashboard-metrics-license-charts.test.ts` (entitlement saturation).
- Stories: `app/src/features/dashboard/components/stories/dashboard.stories.tsx` (`Features/Dashboard/P0DashboardStories`): the summary cards, all charts together, each chart alone and the empty charts, fed by `dashboard.fixtures.ts` in the same folder.
- E2E: `app/e2e/app/dashboard/dashboard.read.spec.ts` checks the redirect from `/`, the figures and the error state; its data is in `app/e2e/app/dashboard/dashboard.scenarios.ts`. Other specs render the page too: `app/e2e/app/accessibility/accessibility.spec.ts` runs WCAG checks on it, `app/e2e/app/mobile/mobile.read.spec.ts` uses a phone-sized viewport and `app/e2e/app/i18n/i18n.locale.spec.ts` switches it to French.

## Public API

`app/src/features/dashboard/index.ts` exports `DashboardPageContent`. Only `app/src/routes/dashboard/index.tsx` imports it, as routes are the only importers of a feature (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)). The cards, charts and hooks are internal to the feature.

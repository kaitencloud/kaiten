import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import {
  DashboardPage,
  type DashboardSearch,
  dashboardSearchSchema,
  DEFAULT_DASHBOARD_RANGE,
  DEFAULT_DASHBOARD_VIEW,
  dashboardSummaryQueryOptions,
  toDashboardSearch,
} from '@/features/dashboard';

// The period and the view travel in the address, so a link opens the dashboard
// on them and a reload keeps them. A value that is the default is left out of
// the address, so `/dashboard` stays `/dashboard`. The loader has the summary
// ready before the page draws.
export const Route = createFileRoute('/dashboard/')({
  component: DashboardRoute,
  // The schema itself, so that a link may leave the period and the view out
  // while the page always reads both.
  validateSearch: dashboardSearchSchema,
  // The router writes the validated search back into the address: without
  // this, `/dashboard` would read `/dashboard?range=30d&view=customers`.
  search: {
    middlewares: [
      stripSearchParams<DashboardSearch>({
        range: DEFAULT_DASHBOARD_RANGE,
        view: DEFAULT_DASHBOARD_VIEW,
      }),
    ],
  },
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      dashboardSummaryQueryOptions(deps.range),
    ),
});

function DashboardRoute() {
  const { range, view } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <DashboardPage
      view={view}
      range={range}
      onRangeChange={(next) =>
        navigate({
          search: toDashboardSearch({ range: next, view }),
          replace: true,
        })
      }
    />
  );
}

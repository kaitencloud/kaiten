import { createFileRoute } from '@tanstack/react-router';
import { BillingRouteError } from '@/domains/billing';
import {
  HandoffPageContent,
  handoffQueryOptions,
  handoffStatusOf,
  readHandoffSearch,
} from '@/features/billing';
import i18n from '@/lib/i18n/config';

// `?status=ACKNOWLEDGED` shows what was booked; the queue opens on what waits.
export const Route = createFileRoute('/billing/handoff/')({
  component: HandoffRoute,
  // The API's own words for why the queue could not be read, around the console
  // that still works.
  errorComponent: BillingRouteError,
  validateSearch: (search) => readHandoffSearch(search),
  loaderDeps: ({ search }) => ({
    status: handoffStatusOf(readHandoffSearch(search)),
  }),
  // Loads every invoice of the part of the queue, like the other list pages load
  // theirs.
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(handoffQueryOptions(deps.status)),
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Billing.Handoff.title'),
  }),
});

function HandoffRoute() {
  const status = Route.useSearch({
    select: (search) => handoffStatusOf(readHandoffSearch(search)),
  });

  return <HandoffPageContent status={status} />;
}

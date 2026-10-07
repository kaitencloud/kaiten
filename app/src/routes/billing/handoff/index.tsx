import { createFileRoute } from '@tanstack/react-router';
import {
  HandoffPageContent,
  handoffQueryOptions,
  handoffStatusOf,
  readHandoffSearch,
  toHandoffSearch,
} from '@/features/billing';
import i18n from '@/lib/i18n/config';

// `?status=ACKNOWLEDGED` shows what was booked; the queue opens on what waits.
export const Route = createFileRoute('/billing/handoff/')({
  component: HandoffRoute,
  validateSearch: (search) => readHandoffSearch(search),
  loaderDeps: ({ search }) => ({ status: handoffStatusOf(search) }),
  // Warms the first page without failing the route: a refusal is shown by the
  // page, with a way to ask again.
  loader: async ({ context, deps }) => {
    await context.queryClient.prefetchInfiniteQuery(
      handoffQueryOptions(deps.status),
    );
  },
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Billing.Handoff.title'),
  }),
});

function HandoffRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  return (
    <HandoffPageContent
      onStatusChange={(status) =>
        void navigate({ search: toHandoffSearch(status) })
      }
      status={handoffStatusOf(search)}
    />
  );
}

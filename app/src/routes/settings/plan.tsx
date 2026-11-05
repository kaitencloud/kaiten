import { createFileRoute, notFound } from '@tanstack/react-router';
import { PlanPageContent } from '@/features/settings';
import i18n from '@/lib/i18n/config';
import { planBillingFlagQueryOptions } from '@/lib/feature-flags';

type PlanSearch = { plan?: string };

export const Route = createFileRoute('/settings/plan')({
  // The plan being checked out, so that a return from Stripe lands on it.
  validateSearch: (search: Record<string, unknown>): PlanSearch => ({
    plan:
      typeof search.plan === 'string' && /^[a-z0-9-]{1,100}$/.test(search.plan)
        ? search.plan
        : undefined,
  }),
  // Kaiten Cloud only, for the organizations `plan-billing` targets: elsewhere
  // the page does not exist, as on self-hosted, and nothing of it is asked.
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.ensureQueryData(
      planBillingFlagQueryOptions,
    );
    if (!enabled) {
      throw notFound();
    }

    return { getTitle: () => i18n.t('Pages.Settings.Plan.title') };
  },
  component: PlanRouteComponent,
});

function PlanRouteComponent() {
  const { plan } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <PlanPageContent
      onSelectPlan={(next) => void navigate({ search: { plan: next } })}
      selectedPlan={plan}
    />
  );
}

import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { planSessionProblem, planSessionQueryOptions } from '../plan-session';
import { PlanSessionProblemCard } from './plan-session-problem-card';

// Kaiten's React SDK is this page's alone: loaded while the session is minted,
// behind the same skeleton, so no other settings page carries it.
const PlanPortal = lazy(() =>
  import('./plan-portal').then((m) => ({ default: m.PlanPortal })),
);

type PlanPageContentProps = {
  selectedPlan?: string;
  onSelectPlan: (slug: string | undefined) => void;
};

/**
 * Plan & usage (§17.2 #16): the organization's Kaiten Cloud plan, its usage, its
 * invoices and payment method, and the move to another plan. Organization
 * administrators only, on Kaiten Cloud only, behind `plan-billing`.
 */
export function PlanPageContent({
  selectedPlan,
  onSelectPlan,
}: PlanPageContentProps) {
  const { t } = useTranslation();
  const query = useQuery(planSessionQueryOptions);
  const Icon = dataModelIcons.license;

  const pending = (
    <div
      aria-busy="true"
      aria-label={t('Pages.Settings.Plan.loading')}
      role="status"
    >
      <Skeleton className="h-96 w-full" />
    </div>
  );

  function renderBody() {
    if (query.isPending) {
      return pending;
    }
    if (query.isError) {
      return (
        <PlanSessionProblemCard
          onRetry={() => void query.refetch()}
          problem={planSessionProblem(query.error)}
        />
      );
    }

    return (
      <Suspense fallback={pending}>
        <PlanPortal
          onSelectPlan={onSelectPlan}
          selectedPlan={selectedPlan}
          session={query.data}
        />
      </Suspense>
    );
  }

  return (
    <Page layout="scroll">
      <Page.Fixed>
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <Icon className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.Title>{t('Pages.Settings.Plan.title')}</Page.Title>
              <Page.Subtitle>{t('Pages.Settings.Plan.subtitle')}</Page.Subtitle>
            </Page.Heading>
          </Page.Leading>
        </Page.Header>
      </Page.Fixed>
      <Page.Scroll className="mt-6">{renderBody()}</Page.Scroll>
    </Page>
  );
}

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AiQueryError, useAiAccess } from '@/domains/ai-credits';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { PricingRateCard } from './pricing-rate-card';
import type { PricingSearch } from './pricing-search.schema';
import { NoPoolState } from './rate-card-empty';
import { useRateCard } from './use-rate-card';

type PricingPageProps = {
  search: PricingSearch;
};

const PricingIcon = dataModelIcons.ai;

function RateCardSkeleton() {
  const { t } = useTranslation();

  return (
    <div
      aria-busy="true"
      aria-label={t('AI.Pricing.loading')}
      className="flex flex-col gap-4"
      role="status"
    >
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-44" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <p
      className="rounded-lg border bg-card p-4 text-sm text-muted-foreground"
      role="status"
    >
      {children}
    </p>
  );
}

/**
 * The rate card of the AI credit pools: what the reference call costs in credits
 * for each model on each licence version, where that price comes from, and what
 * a credit costs at the vendor. The `/ai` route guards the area; this page only
 * decides what a session that may not read, or may not write, is shown.
 */
export function PricingPage({ search }: PricingPageProps) {
  const { t } = useTranslation();
  const access = useAiAccess();
  const mayRead =
    access.allows('listConversionRules') &&
    access.allows('listModels') &&
    access.allows('listEntitlements');
  const mayWrite =
    access.allows('createConversionRule') ||
    access.allows('updateConversionRule');
  const { error, isPending, retry, view } = useRateCard(search, mayRead);
  const ready = access.available && !access.isPending;
  const { pool } = view;

  function renderBody() {
    if (!ready) {
      return null;
    }
    if (!mayRead) {
      return <Notice>{t('AI.Pricing.readDenied')}</Notice>;
    }
    if (error) {
      return <AiQueryError error={error} onRetry={retry} />;
    }
    if (isPending) {
      return <RateCardSkeleton />;
    }
    if (!pool) {
      return <NoPoolState canCreate={access.allows('createEntitlement')} />;
    }

    return (
      <>
        {mayWrite ? null : <Notice>{t('AI.Pricing.readOnly')}</Notice>}
        <PricingRateCard search={search} view={{ ...view, pool }} />
      </>
    );
  }

  return (
    <Page className="gap-4 pb-6">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <PricingIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('AI.Pricing.title')}</Page.Title>
            <Page.Subtitle>{t('AI.Pricing.subtitle')}</Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
        <Page.Actions className="flex flex-wrap gap-2">
          {pool?.slug ? (
            <Button
              nativeButton={false}
              render={
                <Link
                  params={{ entitlementSlug: pool.slug }}
                  to="/catalog/entitlements/$entitlementSlug"
                />
              }
              variant="outline"
            >
              {t('AI.Pricing.poolSettings')}
            </Button>
          ) : null}
          <Button
            nativeButton={false}
            render={<Link to="/ai/models" />}
            variant="outline"
          >
            {t('AI.Pricing.models')}
          </Button>
        </Page.Actions>
      </Page.Header>
      <div className="flex flex-col gap-4">{renderBody()}</div>
    </Page>
  );
}

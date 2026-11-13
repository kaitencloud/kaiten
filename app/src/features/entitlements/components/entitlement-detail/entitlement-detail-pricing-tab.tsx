import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AiAvailability,
  AiLoading,
  AiQueryError,
  modelsQueryOptions,
  useAiAccess,
} from '@/domains/ai-credits';
import {
  aiRateCardQueryOptions,
  summarisePoolPricing,
  useAddonGrants,
} from '@/domains/ai-credits';
import { Button } from '@/components/ui/button';
import { useEntitlementDetailContext } from './entitlement-detail-context';
import { PoolPricingTable } from './pool-pricing-table';

type EntitlementDetailPricingTabProps = {
  /** The licence version to highlight, from `?version=`. */
  version?: string;
};

function OpenRateCardButton({ poolSlug }: { poolSlug: string }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={<Link to="/ai/pricing" search={{ pool: poolSlug }} />}
    >
      {t('AI.Pool.openRateCard')}
    </Button>
  );
}

/** Neither granted nor priced anywhere: say what to do next. */
function PoolPricingEmpty({ poolSlug }: { poolSlug: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="space-y-3 rounded-lg border bg-card p-5">
      <p className="font-medium">{t('AI.Pool.emptyTitle')}</p>
      <p className="text-sm text-muted-foreground">{t('AI.Pool.emptyBody')}</p>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/catalog/licenses" />}
        >
          {t('AI.Pool.openLicences')}
        </Button>
        <OpenRateCardButton poolSlug={poolSlug} />
      </div>
    </div>
  );
}

function PoolPricingContent({
  poolName,
  poolSlug,
  version,
}: {
  poolName: string;
  poolSlug: string;
  version?: string;
}) {
  const { t } = useTranslation();
  const rateCard = useQuery(aiRateCardQueryOptions);
  const models = useQuery(modelsQueryOptions);
  const rows = useMemo(
    () =>
      rateCard.data && models.data
        ? summarisePoolPricing(rateCard.data, poolSlug, models.data.items)
        : [],
    [rateCard.data, models.data, poolSlug],
  );
  // Which add-on can grant the pool, for the families whose rules say one
  // can: a read of its own per family, that may be refused.
  const addonTargets = useMemo(
    () =>
      [
        ...new Map(
          rows
            .filter((row) => row.grantedByAddons)
            .map((row) => [row.familySlug, row.licenseSlug]),
        ),
      ].map(([familySlug, licenseSlug]) => ({ familySlug, licenseSlug })),
    [rows],
  );
  const addonGrants = useAddonGrants(addonTargets, poolSlug);
  if (rateCard.isPending || models.isPending)
    return <AiLoading label={t('AI.Pool.loading')} />;
  const failed = rateCard.isError ? rateCard : models.isError ? models : null;
  if (failed)
    return (
      <AiQueryError error={failed.error} onRetry={() => failed.refetch()} />
    );
  if (!rows.length) return <PoolPricingEmpty poolSlug={poolSlug} />;
  return (
    <div className="space-y-4">
      <PoolPricingTable
        addonGrants={addonGrants}
        poolName={poolName}
        poolSlug={poolSlug}
        rows={rows}
        selectedVersion={version}
      />
      <p className="text-xs text-muted-foreground">{t('AI.Pool.footnote')}</p>
      {rows.some((row) => row.pricedNotGranted && !row.grantedByAddons) ? (
        <p className="text-xs text-muted-foreground">
          {t('AI.Pool.pricedNotGrantedFootnote')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The Pricing tab of an AI credit pool: a read-only summary of each licence
 * version (grant, rules, models priced, cost per credit) with links into the
 * rate card, where the rules are edited. It is not a second editor.
 */
export function EntitlementDetailPricingTab({
  version,
}: EntitlementDetailPricingTabProps) {
  const { t } = useTranslation();
  const { entitlement } = useEntitlementDetailContext();
  const access = useAiAccess();
  const poolSlug = entitlement.slug ?? '';
  const mayRead =
    access.allows('getLicenses') &&
    access.allows('listConversionRules') &&
    access.allows('listModels');
  return (
    <AiAvailability access={access} mayRead={mayRead}>
      <section className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t('AI.Pool.intro')}
          </p>
          <OpenRateCardButton poolSlug={poolSlug} />
        </div>
        <PoolPricingContent
          poolName={entitlement.name}
          poolSlug={poolSlug}
          version={version}
        />
      </section>
    </AiAvailability>
  );
}

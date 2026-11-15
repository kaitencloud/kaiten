import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  type AddonGrantsState,
  AddonGrantPopover,
  type PoolVersionSummary,
} from '@/domains/ai-credits';
import { Button } from '@/components/ui/button';
import { getAppLocale } from '@/lib/app-locale';
import { formatCreditAmount, formatUsdPerCredit } from './pool-pricing-format';

/** The version's display name: the licence name and its version name or number. */
export function versionLabel(row: PoolVersionSummary): string {
  return `${row.name} · ${row.versionName ?? row.version}`;
}

export function PoolVersionCell({ row }: { row: PoolVersionSummary }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium wrap-anywhere">{versionLabel(row)}</p>
      {row.noRule ? (
        <p
          className="inline-flex rounded-sm bg-destructive-subtle px-2 py-0.5 text-xs font-medium text-destructive-subtle-foreground"
          title={t('AI.Pool.noRuleHelp')}
        >
          {t('AI.Pool.noRule')}
        </p>
      ) : null}
      {row.pricedNotGranted && !row.grantedByAddons ? (
        <p
          className="inline-flex rounded-sm bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning-subtle-foreground"
          title={t('AI.Pool.pricedNotGrantedHelp')}
        >
          {t('AI.Pool.pricedNotGranted')}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground wrap-anywhere">
        {row.licenseSlug} · {t(`AI.enums.${row.lifecycleState}`)}
      </p>
    </div>
  );
}

type PoolGrantCellProps = {
  /** What is known of the add-ons that can grant the pool on the row's family. */
  addons?: AddonGrantsState;
  poolName: string;
  row: PoolVersionSummary;
};

/**
 * What the version grants of the pool. Where the licence grants nothing and an
 * add-on can, it says "through add-on" and opens which: that is not a grant of
 * the version, and not every instance on it holds the add-on.
 */
export function PoolGrantCell({ addons, poolName, row }: PoolGrantCellProps) {
  const { t } = useTranslation();
  const locale = getAppLocale();
  const { grant } = row;
  const addon = row.grantedByAddons ? (
    <AddonGrantPopover
      also={grant.kind !== 'NOT_GRANTED'}
      poolName={poolName}
      state={addons}
      versionName={versionLabel(row)}
    />
  ) : null;
  if (grant.kind === 'NOT_GRANTED')
    return (
      addon ?? (
        <p className="text-muted-foreground">{t('AI.Pool.grant.notGranted')}</p>
      )
    );
  if (grant.kind === 'UNLIMITED')
    return (
      <div className="space-y-1">
        <p>{t('AI.Pool.grant.unlimited')}</p>
        {addon}
      </div>
    );
  return (
    <div className="space-y-1 tabular-nums">
      <p>{formatCreditAmount(grant.value, locale)}</p>
      <p className="text-xs text-muted-foreground">
        {grant.kind === 'HARD_LIMIT'
          ? t('AI.Pool.grant.hardLimit')
          : t('AI.Pool.grant.overage', {
              percent: grant.percent,
              maximum: formatCreditAmount(grant.maximum, locale),
            })}
      </p>
      {addon}
    </div>
  );
}

function WildcardChip({
  type,
}: {
  type: PoolVersionSummary['wildcards'][number];
}) {
  const { t } = useTranslation();
  return (
    <li className="inline-flex rounded-sm border bg-muted px-2 py-0.5 text-xs whitespace-nowrap">
      {t('AI.Pool.wildcardChip', {
        type: type
          ? t(`AI.enums.${type}`).toLocaleLowerCase()
          : t('AI.Pool.anyType'),
      })}
    </li>
  );
}

function renderWildcard(
  type: PoolVersionSummary['wildcards'][number],
  index: number,
) {
  return <WildcardChip key={`${type ?? 'any'}-${index}`} type={type} />;
}

export function PoolWildcardCell({ row }: { row: PoolVersionSummary }) {
  if (!row.wildcards.length)
    return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {row.wildcards.map(renderWildcard)}
    </ul>
  );
}

export function PoolCostCell({ row }: { row: PoolVersionSummary }) {
  const { t } = useTranslation();
  const locale = getAppLocale();
  const { cheapest, dearest } = row;
  const partial = row.partialCosts ? (
    <p className="text-xs text-muted-foreground">
      {t('AI.Pool.costPartial', { count: row.partialCosts })}
    </p>
  ) : null;
  if (!cheapest || !dearest)
    return (
      <div className="space-y-1 text-muted-foreground">
        <p>{row.modelsPriced ? t('AI.Pool.notAvailable') : '—'}</p>
        {partial}
      </div>
    );
  const same = cheapest.modelSlug === dearest.modelSlug;
  return (
    <div className="space-y-1">
      <p className="tabular-nums">
        {same
          ? formatUsdPerCredit(cheapest.costPerCredit, locale)
          : t('AI.Pool.costRange', {
              cheapest: formatUsdPerCredit(cheapest.costPerCredit, locale),
              dearest: formatUsdPerCredit(dearest.costPerCredit, locale),
            })}
      </p>
      <p className="text-xs text-muted-foreground">
        {same
          ? cheapest.modelName
          : t('AI.Pool.costModels', {
              cheapest: cheapest.modelName,
              dearest: dearest.modelName,
            })}
      </p>
      {partial}
    </div>
  );
}

export function PoolRateCardLink({
  poolSlug,
  row,
}: {
  poolSlug: string;
  row: PoolVersionSummary;
}) {
  const { t } = useTranslation();
  return (
    <Button
      variant="outline"
      size="sm"
      className="min-h-11 sm:min-h-8"
      nativeButton={false}
      aria-label={t('AI.Pool.openVersionInRateCard', {
        version: versionLabel(row),
      })}
      render={
        <Link
          to="/ai/pricing"
          search={{ pool: poolSlug, version: row.licenseSlug }}
        />
      }
    >
      {t('AI.Pool.openRateCard')}
    </Button>
  );
}

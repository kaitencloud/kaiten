import { TriangleAlert } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiUsage, Model } from '@/api-client';
import { AddonGrantPopover } from '@/domains/ai-credits';
import { VersionLifecycleBadge } from '@/domains/billing';
import { cn } from '@/lib/utils';
import { vendorCost } from './engine';
import { PricingChip } from './pricing-chip';
import { formatCount, formatUsd } from './pricing-format';
import type { RateCardVersion } from './rate-card-model';

const LIFECYCLE_KEYS = {
  ARCHIVED: 'AI.Pricing.version.lifecycle.ARCHIVED',
  DRAFT: 'AI.Pricing.version.lifecycle.DRAFT',
  PUBLISHED: 'AI.Pricing.version.lifecycle.PUBLISHED',
} as const;

const MODEL_STATUS_KEYS = {
  ARCHIVED: 'AI.Pricing.model.ARCHIVED',
  DEPRECATED: 'AI.Pricing.model.DEPRECATED',
} as const;

export function VersionLifecycle({ version }: { version: RateCardVersion }) {
  const { t } = useTranslation();

  return (
    <VersionLifecycleBadge
      className="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium shadow-none"
      label={t(LIFECYCLE_KEYS[version.lifecycle])}
      state={version.lifecycle}
    />
  );
}

/**
 * Whether the version grants the pool, and how much of it; or that an add-on
 * can, which is not the same thing: the chip then opens which add-on, and says
 * that not every instance holds it.
 */
export function GrantChip({
  poolName,
  version,
}: {
  poolName: string;
  version: RateCardVersion;
}) {
  const { t } = useTranslation();
  if (!version.grant.granted) {
    return version.addonGranted ? (
      <AddonGrantPopover
        poolName={poolName}
        state={version.addons}
        versionName={`${version.name} ${version.versionLabel}`}
      />
    ) : (
      <PricingChip tone="warning">
        {t('AI.Pricing.version.notGranted')}
      </PricingChip>
    );
  }
  const amount =
    version.grant.unlimited || version.grant.amount === null
      ? t('AI.Pricing.version.unlimited')
      : formatCount(version.grant.amount);

  return (
    <>
      <PricingChip tone="success">
        {t('AI.Pricing.version.grants', { amount })}
      </PricingChip>
      {version.addonGranted ? (
        <AddonGrantPopover
          also
          poolName={poolName}
          state={version.addons}
          versionName={`${version.name} ${version.versionLabel}`}
        />
      ) : null}
    </>
  );
}

/** The head of a column: a licence version, its state and what it grants. */
export function VersionHeader({
  poolName,
  version,
}: {
  poolName: string;
  version: RateCardVersion;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 font-normal',
        version.lifecycle === 'ARCHIVED' && 'text-muted-foreground',
      )}
    >
      <span className="text-sm font-semibold">
        {version.name}{' '}
        <span className="font-medium text-muted-foreground">
          {version.versionLabel}
        </span>
      </span>
      <span className="font-mono text-[0.6875rem] text-muted-foreground">
        {version.slug}
      </span>
      <span className="mt-1 flex flex-wrap gap-1">
        <VersionLifecycle version={version} />
        <GrantChip poolName={poolName} version={version} />
        {version.flagged ? (
          <PricingChip
            title={t('AI.Pricing.version.noRuleHint')}
            tone="destructive"
          >
            <TriangleAlert aria-hidden="true" className="size-3" />
            {t('AI.Pricing.version.noRule')}
          </PricingChip>
        ) : null}
      </span>
    </div>
  );
}

/** The head of a row: a model, its state and what the reference call costs. */
export const ModelHeader = memo(function ModelHeader({
  model,
  reference,
}: {
  model: Model;
  reference: AiUsage;
}) {
  const { t } = useTranslation();
  const cost = vendorCost(model.vendorCosts, reference);

  return (
    <div className="flex flex-col gap-0.5 font-normal">
      <span className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'text-sm font-semibold',
            model.status === 'ARCHIVED' && 'text-muted-foreground line-through',
          )}
        >
          {model.name}
        </span>
        {model.status === 'ACTIVE' ? null : (
          <PricingChip
            tone={model.status === 'DEPRECATED' ? 'warning' : 'neutral'}
          >
            {t(MODEL_STATUS_KEYS[model.status])}
          </PricingChip>
        )}
      </span>
      <span className="font-mono text-[0.6875rem] text-muted-foreground">
        {model.slug}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {cost.total === null
          ? t('AI.Pricing.grid.vendorCostUnknown')
          : t('AI.Pricing.grid.vendorCost', { cost: formatUsd(cost.total) })}
      </span>
    </div>
  );
});

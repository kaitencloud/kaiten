import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntitlementUsage } from '@/api-client';
import { getEntitlementsUsageMetricsOptions } from '@/api-client/@tanstack/react-query.gen';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiAccess } from '@/domains/ai-credits';
import { allEntitlementsOptions } from '@/lib/api/all-pages-query-options';
import { useInstanceDetail } from '../instance-detail-context';
import { AiPoolSection } from './ai-pool-section';
import { FILTER_KEYS } from './ai-usage-search';
import { useAiUsageSearch } from './use-ai-usage-search';

function UsageLoading() {
  const { t } = useTranslation();

  return (
    <div role="status" className="space-y-3 rounded-xl border p-4">
      <span className="sr-only">{t('Common.loading')}</span>
      <Skeleton className="h-24 w-full motion-reduce:animate-none" />
      <Skeleton className="h-10 w-full motion-reduce:animate-none" />
    </div>
  );
}

type Pool = {
  usage: EntitlementUsage;
  name: string;
  /** The entitlement's early-warning threshold; the usage read has none. */
  warningThresholdPercent: number | null;
};

function renderPoolItem(item: { value: string; label: string }) {
  return (
    <SelectItem key={item.value} value={item.value}>
      {item.label}
    </SelectItem>
  );
}

function PoolSelect({
  pools,
  value,
  onChange,
}: {
  pools: Pool[];
  value: string;
  onChange: (pool: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const items = pools.map((pool) => ({
    value: pool.usage.entitlementSlug,
    label: pool.name,
  }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label htmlFor={id}>{t('AI.Usage.poolSelect')}</Label>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => next !== null && onChange(String(next))}
      >
        <SelectTrigger id={id} className="h-10 w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{items.map(renderPoolItem)}</SelectContent>
      </Select>
    </div>
  );
}

/**
 * An instance's AI usage tab: one AI credit pool at a time (a Select when the
 * instance has several, kept in `?pool=`), with its balance, open holds,
 * inference feed and charge receipts. Rendered only where AI is available and
 * the session may read inferences or reservations; the tab entry is gated the
 * same way.
 */
export function InstanceAiUsageTab() {
  const access = useAiAccess();

  return access.available &&
    (access.allows('listAiInferences') ||
      access.allows('listAiReservations')) ? (
    <EnabledInstanceAiUsageTab />
  ) : null;
}

function EnabledInstanceAiUsageTab() {
  const { t } = useTranslation();
  const { instance } = useInstanceDetail();
  const { search, update } = useAiUsageSearch();
  const { data: entitlements } = useSuspenseQuery(allEntitlementsOptions());
  const { data: metrics } = useSuspenseQuery(
    getEntitlementsUsageMetricsOptions({
      path: { instanceSlug: instance.slug! },
    }),
  );
  // The entitlements are already read for the pools' names: the same read
  // gives each pool's warning threshold, with no request of its own.
  const creditPools = new Map(
    entitlements.items
      .filter((item) => item.type === 'NUMBER_AI_CREDIT')
      .map((item) => [item.slug, item]),
  );
  const pools: Pool[] = (metrics ?? []).flatMap((usage) => {
    const pool = creditPools.get(usage.entitlementSlug);

    return pool
      ? [
          {
            usage,
            name: pool.name,
            warningThresholdPercent: pool.warningThresholdPercent ?? null,
          },
        ]
      : [];
  });
  const selected =
    pools.find((pool) => pool.usage.entitlementSlug === search.pool) ??
    pools[0];
  function selectPool(pool: string) {
    // Filters and receipt belong to the pool they were set on.
    update({
      ...Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])),
      pool,
      receipt: undefined,
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t('AI.Usage.title')}</h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {t('AI.Usage.description')}
          </p>
        </div>
        {pools.length > 1 && selected ? (
          <PoolSelect
            pools={pools}
            value={selected.usage.entitlementSlug}
            onChange={selectPool}
          />
        ) : null}
      </div>
      {selected ? (
        <Suspense fallback={<UsageLoading />}>
          <AiPoolSection
            key={selected.usage.entitlementSlug}
            instanceSlug={instance.slug!}
            usage={selected.usage}
            name={selected.name}
            warningThresholdPercent={selected.warningThresholdPercent}
          />
        </Suspense>
      ) : (
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-medium">{t('AI.Usage.noPools')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('AI.Usage.noPoolsHint')}
          </p>
        </div>
      )}
    </div>
  );
}

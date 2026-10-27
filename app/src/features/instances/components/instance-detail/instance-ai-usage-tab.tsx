import { useAiAccess } from '@/domains/ai-credits';
import { Suspense, useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AiInference, EntitlementUsage } from '@/api-client';
import { listAiInferences } from '@/api-client';
import {
  getEntitlementsUsageMetricsOptions,
  listAiInferencesQueryKey,
  listAiReservationsOptions,
} from '@/api-client/@tanstack/react-query.gen';
import { allEntitlementsOptions } from '@/lib/api/all-pages-query-options';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { getApiErrorMessage } from '@/lib/errors';
import { useInstanceDetail } from './instance-detail-context';
import { AiUsageSummary } from './ai-usage-summary';
import { AiUsageRecords } from './ai-usage-records';

function filterDate(value: string): string | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}

function UsageLoading({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-3 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Skeleton className="h-10 w-full motion-reduce:animate-none" />
      <Skeleton className="h-10 w-full motion-reduce:animate-none" />
    </div>
  );
}

function PoolUsage({
  instanceSlug,
  usage,
  name,
}: {
  instanceSlug: string;
  usage: EntitlementUsage;
  name: string;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [status, setStatus] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const path = { instanceSlug, entitlementSlug: usage.entitlementSlug };
  const query = {
    limit: 50,
    status: (status || undefined) as AiInference['status'] | undefined,
    transactionId: transactionId || undefined,
    from: filterDate(from),
    to: filterDate(to),
  };
  const invalidRange = Boolean(
    query.from && query.to && query.from >= query.to,
  );
  const errorId = `ai-range-error-${usage.entitlementSlug}`;
  const filtersCount = [status, transactionId, from, to].filter(Boolean).length;
  const inferences = useInfiniteQuery({
    enabled: !invalidRange,
    queryKey: listAiInferencesQueryKey({ path, query }),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      (
        await listAiInferences({
          path,
          query: { ...query, cursor: pageParam },
          signal,
          throwOnError: true,
        })
      ).data,
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor : undefined),
  });
  const reservations = useQuery(listAiReservationsOptions({ path }));
  const rows = inferences.data?.pages.flatMap((page) => page.items ?? []) ?? [];
  function clearFilters() {
    setStatus('');
    setTransactionId('');
    setFrom('');
    setTo('');
  }
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <AiUsageSummary usage={usage} name={name} />
      <div className="space-y-6 px-4 py-5 sm:px-6">
        <section aria-label={t('AI.Usage.reservations')} className="space-y-3">
          <h3
            className={
              reservations.isSuccess && !reservations.data.items?.length
                ? 'sr-only'
                : 'text-sm font-semibold'
            }
          >
            {t('AI.Usage.reservations')}
          </h3>
          {reservations.isError ? (
            <p role="alert" className="text-sm">
              {getApiErrorMessage(reservations.error)}{' '}
              <Button
                variant="outline"
                size="sm"
                onClick={() => reservations.refetch()}
              >
                {t('Common.retry')}
              </Button>
            </p>
          ) : reservations.isPending ? (
            <UsageLoading label={t('AI.Usage.loadingReservations')} />
          ) : reservations.data.items?.length ? (
            <AiUsageRecords
              rows={reservations.data.items}
              reservations
              emptyMessage={t('AI.Usage.noReservations')}
            />
          ) : (
            <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm leading-5 text-muted-foreground">
              {t('AI.Usage.noReservations')}
            </p>
          )}
        </section>
        <section aria-label={t('AI.Usage.feed')} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-3">
              <h3 className="text-base font-semibold">{t('AI.Usage.feed')}</h3>
              {inferences.data ? (
                <p className="text-xs text-muted-foreground">
                  {t('AI.Usage.loaded', { count: rows.length })}
                </p>
              ) : null}
            </div>
            {filtersCount ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                {t('AI.Usage.clearFilters')}
              </Button>
            ) : null}
          </div>
          <details
            open={isMobile ? undefined : true}
            className="rounded-lg border bg-background p-3"
          >
            <summary className="cursor-pointer text-sm font-medium md:hidden">
              {t('AI.Usage.filters')}
              {filtersCount ? ` (${filtersCount})` : ''}
            </summary>
            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 md:mt-0 lg:grid-cols-4">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`status-${path.entitlementSlug}`}>
                  {t('AI.status')}
                </Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring dark:[color-scheme:dark]"
                  id={`status-${path.entitlementSlug}`}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">{t('AI.Usage.allStatuses')}</option>
                  <option value="RESERVED">
                    {t('AI.Usage.states.RESERVED')}
                  </option>
                  <option value="COMMITTED">
                    {t('AI.Usage.states.COMMITTED')}
                  </option>
                  <option value="RELEASED">
                    {t('AI.Usage.states.RELEASED')}
                  </option>
                  <option value="EXPIRED">
                    {t('AI.Usage.states.EXPIRED')}
                  </option>
                </select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`transaction-${path.entitlementSlug}`}>
                  {t('AI.Usage.transaction')}
                </Label>
                <Input
                  className="h-10"
                  id={`transaction-${path.entitlementSlug}`}
                  value={transactionId}
                  onChange={(event) => setTransactionId(event.target.value)}
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`from-${path.entitlementSlug}`}>
                  {t('AI.Usage.from')}
                </Label>
                <Input
                  className="h-10 min-w-0 dark:[color-scheme:dark]"
                  type="datetime-local"
                  id={`from-${path.entitlementSlug}`}
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  aria-invalid={invalidRange || undefined}
                  aria-describedby={invalidRange ? errorId : undefined}
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`to-${path.entitlementSlug}`}>
                  {t('AI.Usage.to')}
                </Label>
                <Input
                  className="h-10 min-w-0 dark:[color-scheme:dark]"
                  type="datetime-local"
                  id={`to-${path.entitlementSlug}`}
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  aria-invalid={invalidRange || undefined}
                  aria-describedby={invalidRange ? errorId : undefined}
                />
              </div>
            </div>
          </details>
          {invalidRange ? (
            <p
              id={errorId}
              role="alert"
              className="rounded-lg bg-destructive-subtle p-3 text-sm text-destructive-subtle-foreground"
            >
              {t('AI.Errors.invalidRange')}
            </p>
          ) : (
            <>
              {inferences.isError ? (
                <p role="alert" className="text-sm">
                  {getApiErrorMessage(inferences.error)}{' '}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => inferences.refetch()}
                  >
                    {t('Common.retry')}
                  </Button>
                </p>
              ) : null}
              {inferences.isPending ? (
                <UsageLoading label={t('AI.Usage.loadingInferences')} />
              ) : inferences.data ? (
                <AiUsageRecords
                  rows={rows}
                  emptyMessage={t(
                    filtersCount
                      ? 'AI.Usage.noMatches'
                      : 'AI.Usage.noInferences',
                  )}
                />
              ) : null}
            </>
          )}
          {inferences.hasNextPage && !invalidRange ? (
            <Button
              variant="outline"
              disabled={inferences.isFetchingNextPage}
              onClick={() => inferences.fetchNextPage()}
            >
              {t(
                inferences.isFetchingNextPage
                  ? 'AI.Usage.loadingInferences'
                  : 'AI.Usage.more',
              )}
            </Button>
          ) : null}
        </section>
      </div>
    </section>
  );
}

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
  const { data: entitlements } = useSuspenseQuery(allEntitlementsOptions());
  const { data: metrics } = useSuspenseQuery(
    getEntitlementsUsageMetricsOptions({
      path: { instanceSlug: instance.slug! },
    }),
  );
  const pools = new Map(
    entitlements.items
      .filter((item) => item.type === 'NUMBER_AI_CREDIT')
      .map((item) => [item.slug, item.name]),
  );
  const usage = (metrics ?? []).filter((item) =>
    pools.has(item.entitlementSlug),
  );
  function renderPool(item: EntitlementUsage) {
    return (
      <Suspense
        key={item.entitlementSlug}
        fallback={<UsageLoading label={t('Common.loading')} />}
      >
        <PoolUsage
          instanceSlug={instance.slug!}
          usage={item}
          name={pools.get(item.entitlementSlug) ?? item.entitlementSlug}
        />
      </Suspense>
    );
  }
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{t('AI.Usage.title')}</h2>
        <p className="mt-1 hidden text-sm leading-5 text-muted-foreground sm:block">
          {t('AI.Usage.description')}
        </p>
      </div>
      {usage.length ? (
        usage.map(renderPool)
      ) : (
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          {t('AI.Usage.noPools')}
        </p>
      )}
    </div>
  );
}

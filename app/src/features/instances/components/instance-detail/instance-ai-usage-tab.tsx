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
import { TableCard, type ColumnDef } from '@/functionals/table';
import { getApiErrorMessage } from '@/lib/errors';
import { useInstanceDetail } from './instance-detail-context';

function filterDate(value: string): string | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}
function credit(value?: string | number) {
  return value == null ? '—' : Number(value).toFixed(2);
}
function InferenceRecord({ item }: { item: AiInference }) {
  const { t } = useTranslation();
  return (
    <details>
      <summary>{t('AI.Usage.record')}</summary>
      <pre className="max-w-md whitespace-pre-wrap break-all text-xs">
        {JSON.stringify(item, null, 2)}
      </pre>
    </details>
  );
}
function inferenceColumns(
  t: (key: string) => string,
): ColumnDef<AiInference>[] {
  return [
    { accessorKey: 'reportedAt', header: t('AI.Usage.time') },
    { accessorKey: 'model', header: t('AI.model') },
    { accessorKey: 'status', header: t('AI.status') },
    { accessorKey: 'requestStatus', header: t('AI.Usage.requestStatus') },
    {
      id: 'authorization',
      header: t('AI.Usage.authorization'),
      cell: ({ row }) =>
        row.original.denialReason ??
        (row.original.authorized === false
          ? t('AI.Usage.unauthorized')
          : row.original.authorized === true
            ? t('AI.Usage.authorized')
            : '—'),
    },
    {
      id: 'computed',
      header: t('AI.Usage.computed'),
      cell: ({ row }) => credit(row.original.credits.computed),
    },
    {
      id: 'charged',
      header: t('AI.Usage.charged'),
      cell: ({ row }) => credit(row.original.credits.charged),
    },
    {
      id: 'reserved',
      header: t('AI.Usage.reserved'),
      cell: ({ row }) => credit(row.original.credits.reserved),
    },
    { accessorKey: 'expiresAt', header: t('AI.Usage.expires') },
    {
      id: 'record',
      header: t('AI.Usage.record'),
      cell: ({ row }) => <InferenceRecord item={row.original} />,
    },
  ];
}
function PoolUsage({
  instanceSlug,
  usage,
}: {
  instanceSlug: string;
  usage: EntitlementUsage;
}) {
  const { t } = useTranslation();
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
  // The gauge includes billing's add-on and boost policy, not just the licence.
  const percent = usage.limitCapExceededOveragePercent ?? 0;
  const consumed = usage.value.type === 'number' ? usage.value.value : 0;
  const limit = usage.limit?.type === 'number' ? usage.limit.value : -1;
  const maximum =
    limit < 0 || percent < 0
      ? t('AI.Usage.unlimited')
      : credit(limit * (1 + percent / 100));
  const columns = inferenceColumns(t);
  const rows = inferences.data?.pages.flatMap((page) => page.items ?? []) ?? [];
  return (
    <section className="space-y-4 rounded-md border p-4">
      <h2 className="text-lg font-semibold">{usage.entitlementSlug}</h2>
      <p>
        {usage.currentPeriodStart ?? t('AI.Usage.lifetime')} —{' '}
        {usage.currentPeriodEnd ?? '—'}
      </p>
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div>
          <dt>{t('AI.Usage.consumed')}</dt>
          <dd>{credit(consumed)}</dd>
        </div>
        <div>
          <dt>{t('AI.Usage.reserved')}</dt>
          <dd>{credit(usage.reserved)}</dd>
        </div>
        <div>
          <dt>{t('AI.Usage.limit')}</dt>
          <dd>{limit < 0 ? t('AI.Usage.unlimited') : credit(limit)}</dd>
        </div>
        <div>
          <dt>{t('AI.Usage.maximum')}</dt>
          <dd>{maximum}</dd>
        </div>
      </dl>
      <h3>{t('AI.Usage.reservations')}</h3>
      {reservations.isError ? (
        <p role="alert">
          {getApiErrorMessage(reservations.error)}{' '}
          <Button onClick={() => reservations.refetch()}>
            {t('Common.retry')}
          </Button>
        </p>
      ) : reservations.isPending ? (
        <p>{t('Common.loading')}</p>
      ) : (
        <TableCard>
          <TableCard.Table
            data={reservations.data.items ?? []}
            columns={columns}
            emptyMessage={t('Common.noResults')}
          />
        </TableCard>
      )}
      <h3>{t('AI.Usage.feed')}</h3>
      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <Label htmlFor={`status-${path.entitlementSlug}`}>
            {t('AI.status')}
          </Label>
          <select
            className="h-9 w-full rounded border bg-background px-2"
            id={`status-${path.entitlementSlug}`}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">{t('AI.Usage.allStatuses')}</option>
            <option>RESERVED</option>
            <option>COMMITTED</option>
            <option>RELEASED</option>
            <option>EXPIRED</option>
          </select>
        </div>
        <div>
          <Label htmlFor={`transaction-${path.entitlementSlug}`}>
            {t('AI.Usage.transaction')}
          </Label>
          <Input
            id={`transaction-${path.entitlementSlug}`}
            value={transactionId}
            onChange={(event) => setTransactionId(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`from-${path.entitlementSlug}`}>
            {t('AI.Usage.from')}
          </Label>
          <Input
            type="datetime-local"
            id={`from-${path.entitlementSlug}`}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor={`to-${path.entitlementSlug}`}>
            {t('AI.Usage.to')}
          </Label>
          <Input
            type="datetime-local"
            id={`to-${path.entitlementSlug}`}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
      </div>
      {invalidRange ? (
        <p role="alert">{t('AI.Errors.invalidRange')}</p>
      ) : inferences.isError ? (
        <p role="alert">
          {getApiErrorMessage(inferences.error)}{' '}
          <Button onClick={() => inferences.refetch()}>
            {t('Common.retry')}
          </Button>
        </p>
      ) : inferences.isPending ? (
        <p>{t('Common.loading')}</p>
      ) : (
        <TableCard>
          <TableCard.Table
            data={rows}
            columns={columns}
            emptyMessage={t('Common.noResults')}
          />
        </TableCard>
      )}
      {inferences.hasNextPage ? (
        <Button
          disabled={inferences.isFetchingNextPage}
          onClick={() => inferences.fetchNextPage()}
        >
          {t('AI.Usage.more')}
        </Button>
      ) : null}
    </section>
  );
}
export function InstanceAiUsageTab() {
  const { t } = useTranslation();
  const { instance } = useInstanceDetail();
  const { data: entitlements } = useSuspenseQuery(allEntitlementsOptions());
  const { data: metrics } = useSuspenseQuery(
    getEntitlementsUsageMetricsOptions({
      path: { instanceSlug: instance.slug! },
    }),
  );
  const pools = new Set(
    entitlements.items
      .filter((item) => item.type === 'NUMBER_AI_CREDIT')
      .map((item) => item.slug),
  );
  const usage = (metrics ?? []).filter((item) =>
    pools.has(item.entitlementSlug),
  );
  function renderPool(item: EntitlementUsage) {
    return (
      <Suspense
        key={item.entitlementSlug}
        fallback={<p>{t('Common.loading')}</p>}
      >
        <PoolUsage instanceSlug={instance.slug!} usage={item} />
      </Suspense>
    );
  }
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('AI.Usage.title')}</h1>
      {usage.length ? usage.map(renderPool) : <p>{t('AI.Usage.noPools')}</p>}
    </div>
  );
}

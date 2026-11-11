import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AiInference, EntitlementUsage, Model } from '@/api-client';
import { listAiReservationsOptions } from '@/api-client/@tanstack/react-query.gen';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { type ColumnDef, TableCard } from '@/functionals/table';
import { getApiErrorMessage } from '@/lib/errors';
import { useCatalogue } from './use-catalogue';
import { formatCredits } from './format';
import { ModelCell, rowModel, TimeCell } from './inference-cells';

type PoolPath = { instanceSlug: string; entitlementSlug: string };

/** The open holds of a pool, read once by the pool section and the header. */
export function useReservations(path: PoolPath) {
  return useQuery(listAiReservationsOptions({ path }));
}

function useColumns(models: readonly Model[] | undefined) {
  const { t } = useTranslation();
  const columns: ColumnDef<AiInference>[] = [
    {
      id: 'model',
      header: t('AI.Usage.columns.model'),
      cell: ({ row }) => (
        <ModelCell row={row.original} model={rowModel(models, row.original)} />
      ),
    },
    {
      id: 'transaction',
      header: t('AI.Usage.columns.transaction'),
      cell: ({ row }) => (
        <code className="break-all text-xs">{row.original.transactionId}</code>
      ),
    },
    {
      id: 'created',
      header: t('AI.Usage.columns.created'),
      cell: ({ row }) => <TimeCell value={row.original.reportedAt} />,
    },
    {
      id: 'expires',
      header: t('AI.Usage.columns.expires'),
      cell: ({ row }) => <TimeCell value={row.original.expiresAt} />,
    },
    {
      id: 'reserved',
      header: t('AI.Usage.columns.reserved'),
      meta: {
        headerClassName: 'text-right',
        cellClassName: 'text-right tabular-nums',
      },
      cell: ({ row }) => formatCredits(row.original.credits.reserved),
    },
  ];

  return columns;
}

/**
 * The calls holding credits right now: reserved and not yet committed or
 * expired. The total under them is the pool's reserved amount as the API
 * reports it, the one the header shows: the console adds no amounts up.
 */
export function AiReservationsTable({
  reservations,
  reserved,
}: {
  reservations: ReturnType<typeof useReservations>;
  /** The pool's reserved credits, from the usage read. */
  reserved: EntitlementUsage['reserved'];
}) {
  const { t } = useTranslation();
  const models = useCatalogue();
  const columns = useColumns(models.data?.items);
  const rows = reservations.data?.items ?? [];

  return (
    <section aria-labelledby="ai-reservations" className="space-y-3">
      <h3 id="ai-reservations" className="text-sm font-semibold">
        {t('AI.Usage.reservations')}
      </h3>
      {reservations.isError ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          {getApiErrorMessage(reservations.error)}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reservations.refetch()}
          >
            {t('Common.retry')}
          </Button>
        </p>
      ) : reservations.isPending ? (
        <div role="status" className="space-y-2">
          <span className="sr-only">{t('AI.Usage.loadingReservations')}</span>
          <Skeleton className="h-10 w-full motion-reduce:animate-none" />
        </div>
      ) : rows.length ? (
        <TableCard className="gap-0 overflow-hidden py-0 shadow-none">
          <TableCard.Table
            data={rows}
            columns={columns}
            variant="simple"
            pagination={false}
          />
          <div className="flex justify-between border-t px-4 py-3 text-sm font-medium">
            <span>{t('AI.Usage.totalHeld')}</span>
            <span className="tabular-nums">{formatCredits(reserved)}</span>
          </div>
        </TableCard>
      ) : (
        <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          {t('AI.Usage.noReservations')}
        </p>
      )}
    </section>
  );
}

import { useTranslation } from 'react-i18next';
import type { AiInference } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { TableCard, type ColumnDef } from '@/functionals/table';
import { formatDateTime } from '@/lib/format-date';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatCredits } from './ai-usage-summary';

function InferenceRecord({ item }: { item: AiInference }) {
  const { t } = useTranslation();
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-11 whitespace-nowrap sm:h-9"
            aria-label={t('AI.Usage.inspectRecord', { id: item.transactionId })}
          >
            {t('AI.Usage.viewRecord')}
          </Button>
        }
      />
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('AI.Usage.record')}</DialogTitle>
          <DialogDescription>
            {t('AI.Usage.recordDescription')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="mb-3 break-all font-mono text-sm">
            {item.transactionId}
          </p>
          <pre className="whitespace-pre-wrap break-all rounded-lg bg-muted p-4 font-mono text-xs leading-5">
            {JSON.stringify(item, null, 2)}
          </pre>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function InferenceState({ item }: { item: AiInference }) {
  const { t } = useTranslation();
  const className =
    item.status === 'COMMITTED'
      ? 'border-0 bg-success-subtle text-success-subtle-foreground'
      : item.status === 'RESERVED'
        ? 'border-0 bg-primary-subtle text-primary-subtle-foreground'
        : 'border-0 bg-muted text-muted-foreground';
  return (
    <div className="space-y-1.5">
      <Badge variant="outline" className={className}>
        {t(`AI.Usage.states.${item.status}`)}
      </Badge>
      {item.denialReason ? (
        <p className="text-xs text-warning-subtle-foreground">
          {t(`AI.Usage.denials.${item.denialReason}`, item.denialReason)}
        </p>
      ) : item.requestStatus ? (
        <p className="text-xs text-muted-foreground">
          {t(`AI.Usage.outcomes.${item.requestStatus}`)}
        </p>
      ) : null}
    </div>
  );
}

export function AiUsageRecords({
  rows,
  reservations = false,
  emptyMessage,
}: {
  rows: AiInference[];
  reservations?: boolean;
  emptyMessage: string;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  function renderMobileRecord(item: AiInference) {
    const amount = reservations ? item.credits.reserved : item.credits.charged;
    return (
      <article
        key={`${item.transactionId}:${item.reportedAt}`}
        className="space-y-3 p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-medium">{item.model}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(`AI.Usage.requestTypes.${item.requestType}`)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold tabular-nums">
              {formatCredits(amount)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(reservations ? 'AI.Usage.reserved' : 'AI.Usage.charged')}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <InferenceState item={item} />
          <InferenceRecord item={item} />
        </div>
        <p className="text-xs text-muted-foreground">
          {t(reservations ? 'AI.Usage.expires' : 'AI.Usage.time')}:{' '}
          {formatDateTime(reservations ? item.expiresAt : item.reportedAt)}
        </p>
      </article>
    );
  }
  const columns: ColumnDef<AiInference>[] = [
    {
      id: 'model',
      header: t('AI.model'),
      cell: ({ row }) => (
        <div className="min-w-36">
          <p className="font-medium">{row.original.model}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(`AI.Usage.requestTypes.${row.original.requestType}`)}
          </p>
        </div>
      ),
    },
    {
      id: 'time',
      header: t(reservations ? 'AI.Usage.expires' : 'AI.Usage.time'),
      cell: ({ row }) => (
        <time
          className="whitespace-nowrap text-sm text-muted-foreground"
          dateTime={
            reservations
              ? (row.original.expiresAt ?? undefined)
              : row.original.reportedAt
          }
        >
          {formatDateTime(
            reservations ? row.original.expiresAt : row.original.reportedAt,
          )}
        </time>
      ),
    },
    {
      id: 'status',
      header: t('AI.status'),
      cell: ({ row }) => <InferenceState item={row.original} />,
    },
    {
      id: 'credits',
      header: t(reservations ? 'AI.Usage.reserved' : 'AI.Usage.charged'),
      meta: {
        headerClassName: 'text-right',
        cellClassName: 'text-right tabular-nums',
      },
      cell: ({ row }) => (
        <div className="whitespace-nowrap">
          <p className="font-medium">
            {formatCredits(
              reservations
                ? row.original.credits.reserved
                : row.original.credits.charged,
            )}
          </p>
          {!reservations &&
          row.original.credits.computed != null &&
          row.original.credits.computed !== row.original.credits.charged ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('AI.Usage.computedAmount', {
                amount: formatCredits(row.original.credits.computed),
              })}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'record',
      header: t('AI.Usage.details'),
      meta: { headerClassName: 'text-right', cellClassName: 'text-right' },
      cell: ({ row }) => <InferenceRecord item={row.original} />,
    },
  ];
  if (isMobile) {
    return (
      <div className="divide-y divide-border rounded-xl border bg-card">
        {rows.length ? (
          rows.map(renderMobileRecord)
        ) : (
          <p className="p-4 text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
    );
  }
  return (
    <TableCard className="gap-0 overflow-hidden py-0 shadow-none">
      <TableCard.Table
        data={rows}
        columns={columns}
        variant="simple"
        pagination={false}
        emptyMessage={emptyMessage}
      />
    </TableCard>
  );
}

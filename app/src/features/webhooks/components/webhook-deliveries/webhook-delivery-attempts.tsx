import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type ColumnDef, DataTable } from '@/functionals/table';
import { cn } from '@/lib/utils';
import type { WebhookMessageAttempt } from '../../types';
import {
  formatDeliveryDuration,
  formatDeliveryTime,
  formatDeliveryTrigger,
} from './webhook-delivery-format';
import { WebhookDeliveryStatusBadge } from './webhook-delivery-status-badge';

const DETAIL_KEY = 'Pages.Integrations.Webhooks.Deliveries.Detail';

interface WebhookDeliveryAttemptsProps {
  /** Oldest first: attempt 1 is the first row. */
  attempts: WebhookMessageAttempt[];
  selectedId?: string;
  onSelect: (attemptId: string) => void;
}

const getAttemptRowId = (attempt: WebhookMessageAttempt) => attempt.id;

function createAttemptColumns({
  onSelect,
  selectedId,
  t,
}: {
  onSelect: (attemptId: string) => void;
  selectedId?: string;
  t: TFunction;
}): ColumnDef<WebhookMessageAttempt>[] {
  return [
    {
      id: 'attempt',
      enableSorting: false,
      header: t(`${DETAIL_KEY}.Columns.attempt`),
      meta: { headerClassName: 'w-20' },
      cell: ({ row }) => {
        const index = row.index + 1;
        const selected = row.original.id === selectedId;
        return (
          <button
            aria-label={t(`${DETAIL_KEY}.attemptLabel`, { index })}
            aria-pressed={selected}
            data-row-actions
            className={cn(
              'min-w-8 rounded-md px-2 py-1 font-mono text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected && 'bg-primary text-primary-foreground hover:bg-primary',
            )}
            onClick={() => onSelect(row.original.id)}
            type="button"
          >
            {index}
          </button>
        );
      },
    },
    {
      id: 'time',
      enableSorting: false,
      header: t(`${DETAIL_KEY}.Columns.time`),
      cell: ({ row }) => (
        <time
          className="text-sm text-muted-foreground"
          dateTime={row.original.timestamp}
        >
          {formatDeliveryTime(row.original.timestamp)}
        </time>
      ),
    },
    {
      id: 'trigger',
      enableSorting: false,
      header: t(`${DETAIL_KEY}.Columns.trigger`),
      cell: ({ row }) => (
        <span className="text-sm">
          {formatDeliveryTrigger(row.original.triggerType, t)}
        </span>
      ),
    },
    {
      id: 'result',
      enableSorting: false,
      header: t(`${DETAIL_KEY}.Columns.result`),
      cell: ({ row }) => (
        <WebhookDeliveryStatusBadge
          responseStatusCode={row.original.responseStatusCode}
          status={row.original.status}
        />
      ),
    },
    {
      id: 'duration',
      enableSorting: false,
      header: t(`${DETAIL_KEY}.Columns.duration`),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {(row.original.responseDurationMs ?? 0) > 0
            ? formatDeliveryDuration(row.original.responseDurationMs ?? 0, t)
            : '—'}
        </span>
      ),
    },
  ];
}

/**
 * The webhook's attempts at one message. The number in the first cell is a
 * button that selects the attempt (its response shows above); a click anywhere
 * else on the row does the same.
 */
export function WebhookDeliveryAttempts({
  attempts,
  selectedId,
  onSelect,
}: WebhookDeliveryAttemptsProps) {
  const { t } = useTranslation();
  const columns = useMemo(
    () => createAttemptColumns({ onSelect, selectedId, t }),
    [onSelect, selectedId, t],
  );

  function getRowClassName(attempt: WebhookMessageAttempt) {
    return attempt.id === selectedId ? 'bg-accent' : undefined;
  }

  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">{t(`${DETAIL_KEY}.attempts`)}</h4>
      <DataTable
        columns={columns}
        data={attempts}
        emptyMessage={t(`${DETAIL_KEY}.noAttempt`)}
        getRowClassName={getRowClassName}
        getRowId={getAttemptRowId}
        onClickRow={(row) => onSelect(row.original.id)}
        pagination={false}
        variant="simple"
      />
    </section>
  );
}

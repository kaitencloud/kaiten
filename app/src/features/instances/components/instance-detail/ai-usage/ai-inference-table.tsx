import { useTranslation } from 'react-i18next';
import type { AiInference, Model } from '@/api-client';
import { Button } from '@/components/ui/button';
import { type ColumnDef, TableCard } from '@/functionals/table';
import { formatCredits } from './format';
import {
  ChargedCell,
  ModelCell,
  rowModel,
  StatusCell,
  TimeCell,
} from './inference-cells';
import { usageLabel } from './usage-label';

type AiInferenceTableProps = {
  rows: AiInference[];
  models: readonly Model[] | undefined;
  emptyMessage: string;
  onOpenReceipt: (transactionId: string) => void;
};

function ReceiptButton({
  transactionId,
  onOpen,
}: {
  transactionId: string;
  onOpen: (transactionId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-11 sm:h-8"
      aria-label={t('AI.Receipt.openFor', { id: transactionId })}
      onClick={() => onOpen(transactionId)}
    >
      {t('AI.Receipt.open')}
    </Button>
  );
}

/**
 * The inference feed: one row per reported call, newest first, with what it
 * was charged and where it left the pool's counter. Each row opens its charge
 * receipt.
 */
export function AiInferenceTable({
  rows,
  models,
  emptyMessage,
  onOpenReceipt,
}: AiInferenceTableProps) {
  const { t } = useTranslation();
  const columns: ColumnDef<AiInference>[] = [
    {
      id: 'reportedAt',
      header: t('AI.Usage.columns.reportedAt'),
      cell: ({ row }) => <TimeCell value={row.original.reportedAt} />,
    },
    {
      id: 'model',
      header: t('AI.Usage.columns.model'),
      cell: ({ row }) => (
        <ModelCell row={row.original} model={rowModel(models, row.original)} />
      ),
    },
    {
      id: 'status',
      header: t('AI.Usage.columns.status'),
      cell: ({ row }) => (
        <StatusCell row={row.original} model={rowModel(models, row.original)} />
      ),
    },
    {
      id: 'usage',
      header: t('AI.Usage.columns.usage'),
      cell: ({ row }) => (
        <span className="block max-w-56 text-sm">
          {row.original.authorized === false ||
          row.original.status === 'EXPIRED' ||
          row.original.status === 'RESERVED'
            ? t('AI.Usage.usage.none')
            : usageLabel(t, row.original.usage)}
        </span>
      ),
    },
    {
      id: 'charged',
      header: t('AI.Usage.columns.charged'),
      meta: { headerClassName: 'text-right' },
      cell: ({ row }) => <ChargedCell row={row.original} />,
    },
    {
      id: 'counterAfter',
      header: t('AI.Usage.columns.counterAfter'),
      meta: {
        headerClassName: 'text-right',
        cellClassName: 'text-right tabular-nums text-muted-foreground',
      },
      cell: ({ row }) => formatCredits(row.original.valueAfter),
    },
    {
      id: 'receipt',
      header: () => (
        <span className="sr-only">{t('AI.Usage.columns.receipt')}</span>
      ),
      meta: { cellClassName: 'text-right' },
      cell: ({ row }) => (
        <ReceiptButton
          transactionId={row.original.transactionId}
          onOpen={onOpenReceipt}
        />
      ),
    },
  ];

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

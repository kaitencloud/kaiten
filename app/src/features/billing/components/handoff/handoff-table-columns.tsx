import { Check } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { QueuedInvoice } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import {
  compareInvoiceTotals,
  formatInstant,
  formatUtcDate,
  formatUtcTime,
  InvoiceCustomerCell,
  InvoiceKindCell,
  InvoiceStatusBadge,
  InvoiceTotalCell,
  isHandoffLeased,
  rightAlignedSortableHeader,
} from '@/domains/billing';
import {
  type ColumnDef,
  createActionsColumn,
  dataTableSortableHeader,
  TableActionButton,
  TableActions,
} from '@/functionals/table';
import type { HandoffQueueStatus } from '../../schemas/handoff-search.schema';

function ClaimsCell({ invoice }: { invoice: QueuedInvoice }) {
  const { i18n, t } = useTranslation();
  const { handoff } = invoice;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="tabular-nums">
        {t('Pages.Billing.Handoff.claims', { count: handoff.claimCount })}
      </span>
      {isHandoffLeased(handoff) ? (
        // The date wraps inside the chip, so that one invoice that a consumer holds
        // does not widen the column of them all.
        <Badge
          className="h-auto max-w-44 rounded-md px-2 py-0.5 text-left font-normal whitespace-normal"
          variant="outline"
        >
          {t('Pages.Billing.Handoff.reservedUntil', {
            date: formatInstant(handoff.leasedUntil, i18n.language),
          })}
        </Badge>
      ) : null}
    </div>
  );
}

function BookedCell({ invoice }: { invoice: QueuedInvoice }) {
  const { i18n, t } = useTranslation();
  const { handoff } = invoice;

  return (
    <div className="min-w-0">
      {handoff.externalReference ? (
        <span className="font-mono text-sm">{handoff.externalReference}</span>
      ) : (
        <span className="text-sm text-muted-foreground">
          {t('Pages.Billing.Handoff.noReference')}
        </span>
      )}
      <span className="block text-xs text-muted-foreground">
        {formatInstant(handoff.acknowledgedAt, i18n.language)}
      </span>
    </div>
  );
}

/** When it was issued, the day and under it the time: the queue is read oldest first, and the time orders what a day holds. */
function IssuedCell({ invoice }: { invoice: QueuedInvoice }) {
  const { i18n } = useTranslation();

  return (
    <div>
      <span className="text-sm">
        {formatUtcDate(invoice.issuedAt, i18n.language)}
      </span>
      <span className="block text-xs text-muted-foreground">
        {formatUtcTime(invoice.issuedAt, i18n.language)}
      </span>
    </div>
  );
}

const instant = (value: string | undefined) =>
  value === undefined ? undefined : Date.parse(value);

/**
 * The columns of the handoff queue: who the invoice is for, what it bills and comes
 * to, the status it is in now (a void or written-off invoice still waits in the
 * queue, and its consumer sees it as such), when it was issued and, for what waits,
 * how many times a consumer has taken it and until when one holds it; for what was
 * booked, under which number and when. The queue is read whole, so the browser sorts
 * it: oldest issue first, as the queue is read, until a header is pressed. The
 * button that acknowledges by hand is there only when a handler is given.
 */
export function useHandoffColumns(
  status: HandoffQueueStatus,
  onAcknowledge: ((invoice: QueuedInvoice) => void) | undefined,
): ColumnDef<QueuedInvoice>[] {
  const { t } = useTranslation();

  return useMemo(() => {
    const columns: ColumnDef<QueuedInvoice>[] = [
      {
        accessorFn: (invoice) => invoice.customerName,
        cell: ({ row }) => <InvoiceCustomerCell invoice={row.original} />,
        header: dataTableSortableHeader(
          t('Features.Billing.Invoices.Columns.customer'),
        ),
        id: 'invoice',
      },
      {
        accessorFn: (invoice) => instant(invoice.boundaryAt),
        cell: ({ row }) => <InvoiceKindCell invoice={row.original} />,
        header: dataTableSortableHeader(
          t('Features.Billing.Invoices.Columns.invoice'),
        ),
        id: 'kind',
      },
      {
        accessorFn: (invoice) => invoice.total,
        cell: ({ row }) => <InvoiceTotalCell invoice={row.original} />,
        header: rightAlignedSortableHeader<QueuedInvoice>(
          t('Features.Billing.Invoices.Columns.total'),
        ),
        id: 'total',
        // An amount is in the minor units of its currency: the queue can hold several,
        // so it is ordered by currency, and by amount within one.
        sortFn: (a, b) => compareInvoiceTotals(a.original, b.original),
      },
      {
        cell: ({ row }) => <InvoiceStatusBadge invoice={row.original} />,
        enableSorting: false,
        header: t('Features.Billing.Invoices.Columns.status'),
        id: 'status',
      },
      {
        accessorFn: (invoice) => instant(invoice.issuedAt),
        cell: ({ row }) => <IssuedCell invoice={row.original} />,
        header: dataTableSortableHeader(
          t('Pages.Billing.Handoff.Columns.issued'),
        ),
        id: 'issued',
        // The queue is read oldest first: that is the order a consumer takes it in.
        meta: { defaultSort: 'asc' },
        sortUndefined: 'last',
      },
    ];

    if (status === 'ACKNOWLEDGED') {
      columns.push({
        accessorFn: (invoice) => instant(invoice.handoff.acknowledgedAt),
        cell: ({ row }) => <BookedCell invoice={row.original} />,
        header: dataTableSortableHeader(
          t('Pages.Billing.Handoff.Columns.booked'),
        ),
        id: 'booked',
        sortUndefined: 'last',
      });
    }
    columns.push({
      accessorFn: (invoice) => invoice.handoff.claimCount,
      cell: ({ row }) => <ClaimsCell invoice={row.original} />,
      header: dataTableSortableHeader(
        t('Pages.Billing.Handoff.Columns.claims'),
      ),
      id: 'claims',
    });
    if (status === 'PENDING' && onAcknowledge) {
      columns.push(
        createActionsColumn<QueuedInvoice>((invoice) => (
          <TableActions>
            <TableActionButton
              onClick={() => onAcknowledge(invoice)}
              tooltip={t('Pages.Billing.Handoff.acknowledge')}
            >
              <Check aria-hidden size={16} />
            </TableActionButton>
          </TableActions>
        )),
      );
    }

    return columns;
  }, [onAcknowledge, status, t]);
}

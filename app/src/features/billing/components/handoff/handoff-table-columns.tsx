import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { QueuedInvoice } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatInstant,
  formatUtcDate,
  formatUtcTime,
  InvoiceCustomerCell,
  InvoiceKindCell,
  InvoiceStatusBadge,
  InvoiceTotalCell,
  isHandoffLeased,
  rightAlignedHeader,
} from '@/domains/billing';
import {
  type ColumnDef,
  createActionsColumn,
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

/**
 * The columns of the handoff queue: who the invoice is for, what it bills and comes
 * to, the status it is in now (a void or written-off invoice still waits in the
 * queue, and its consumer sees it as such), when it was issued and, for what waits,
 * how many times a consumer has taken it and until when one holds it; for what was
 * booked, under which number and when. The button that acknowledges by hand is
 * there only when a handler is given.
 */
export function useHandoffColumns(
  status: HandoffQueueStatus,
  onAcknowledge: ((invoice: QueuedInvoice) => void) | undefined,
): ColumnDef<QueuedInvoice>[] {
  const { t } = useTranslation();

  return useMemo(() => {
    const columns: ColumnDef<QueuedInvoice>[] = [
      {
        cell: ({ row }) => <InvoiceCustomerCell invoice={row.original} />,
        enableSorting: false,
        header: t('Features.Billing.Invoices.Columns.customer'),
        id: 'invoice',
      },
      {
        cell: ({ row }) => <InvoiceKindCell invoice={row.original} />,
        enableSorting: false,
        header: t('Features.Billing.Invoices.Columns.invoice'),
        id: 'kind',
      },
      {
        cell: ({ row }) => <InvoiceTotalCell invoice={row.original} />,
        enableSorting: false,
        header: rightAlignedHeader(
          t('Features.Billing.Invoices.Columns.total'),
        ),
        id: 'total',
      },
      {
        cell: ({ row }) => <InvoiceStatusBadge invoice={row.original} />,
        enableSorting: false,
        header: t('Features.Billing.Invoices.Columns.status'),
        id: 'status',
      },
      {
        cell: ({ row }) => <IssuedCell invoice={row.original} />,
        enableSorting: false,
        header: t('Pages.Billing.Handoff.Columns.issued'),
        id: 'issued',
      },
    ];

    if (status === 'ACKNOWLEDGED') {
      columns.push({
        cell: ({ row }) => <BookedCell invoice={row.original} />,
        enableSorting: false,
        header: t('Pages.Billing.Handoff.Columns.booked'),
        id: 'booked',
      });
    }
    columns.push({
      cell: ({ row }) => <ClaimsCell invoice={row.original} />,
      enableSorting: false,
      header: t('Pages.Billing.Handoff.Columns.claims'),
      id: 'claims',
    });
    if (status === 'PENDING' && onAcknowledge) {
      columns.push(
        createActionsColumn<QueuedInvoice>((invoice) => (
          <TableActions>
            <Button
              onClick={() => onAcknowledge(invoice)}
              size="sm"
              type="button"
              variant="outline"
            >
              {t('Pages.Billing.Handoff.acknowledge')}
            </Button>
          </TableActions>
        )),
      );
    }

    return columns;
  }, [onAcknowledge, status, t]);
}

import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { InvoiceSummary } from '@/api-client';
import { type ColumnDef, dataTableSortableHeader } from '@/functionals/table';
import { compareInvoiceTotals, formatUtcDate } from '../logic';
import { HandoffStatusLabel } from './handoff-status-label';
import {
  InvoiceCustomerCell,
  InvoiceKindCell,
  InvoiceTotalCell,
} from './invoice-cells';
import { InvoiceStatusBadge } from './invoice-status-badge';
import { ProviderBadge } from './provider-badge';
import { ServicePeriod } from './service-period';
import { rightAlignedSortableHeader } from './table-headers';

/** The columns of the table of invoices, which a screen leaves out when it already says what they do. */
export type InvoicesTableColumn =
  | 'invoice'
  | 'kind'
  | 'period'
  | 'total'
  | 'status'
  | 'due'
  | 'provider'
  | 'handoff';

function DueCell({ invoice }: { invoice: InvoiceSummary }) {
  const { i18n, t } = useTranslation();

  return invoice.dueAt ? (
    <span className="text-sm">
      {formatUtcDate(invoice.dueAt, i18n.language)}
    </span>
  ) : (
    <span className="text-sm text-muted-foreground">
      {t('Features.Billing.Invoices.notIssued')}
    </span>
  );
}

/** How a column sorts: what its rows are ordered by, and whether it opens the table ordered. */
type ColumnSort = {
  /** What the table orders the rows by, which is not always what the cell says. */
  by: (invoice: InvoiceSummary) => number | string | undefined;
  defaultSort?: 'asc' | 'desc';
  /** How two rows compare, where the order of what `by` reads is not the plain one. */
  sortFn?: ColumnDef<InvoiceSummary>['sortFn'];
  /** The title of the header, which becomes the button that toggles the sort. */
  title: string;
  /** Whether the title is aligned right, over a column of amounts. */
  alignRight?: boolean;
};

const instant = (value: string | null | undefined) =>
  value === undefined || value === null ? undefined : Date.parse(value);

function column(
  id: InvoicesTableColumn,
  header: ColumnDef<InvoiceSummary>['header'],
  cell: (invoice: InvoiceSummary) => ReactNode,
): [InvoicesTableColumn, ColumnDef<InvoiceSummary>] {
  return [
    id,
    { cell: ({ row }) => cell(row.original), enableSorting: false, header, id },
  ];
}

function sortableColumn(
  id: InvoicesTableColumn,
  { alignRight, by, defaultSort, sortFn, title }: ColumnSort,
  cell: (invoice: InvoiceSummary) => ReactNode,
): [InvoicesTableColumn, ColumnDef<InvoiceSummary>] {
  return [
    id,
    {
      accessorFn: by,
      cell: ({ row }) => cell(row.original),
      // An invoice that was not issued has no due date: it goes last, whichever
      // way the dates go.
      sortUndefined: 'last',
      header: alignRight
        ? rightAlignedSortableHeader<InvoiceSummary>(title)
        : dataTableSortableHeader(title),
      id,
      meta: defaultSort ? { defaultSort } : undefined,
      // Left out when there is none: an `undefined` would replace the default of
      // the table, which picks the order from what the column holds.
      ...(sortFn ? { sortFn } : {}),
    },
  ];
}

/**
 * The columns of the table of invoices, minus the ones a screen leaves out. The
 * list is read whole, so the browser sorts it: who it is for, the boundary it
 * bills (newest first, as the table opens), the service period, the total and the
 * due date. The status, the provider and the handoff are filters, not orders. The
 * columns are rebuilt only when the language or the set of columns changes, so
 * `hiddenColumns` has to be the same array from one render to the next.
 */
export function useInvoiceColumns(
  hiddenColumns: readonly InvoicesTableColumn[],
): ColumnDef<InvoiceSummary>[] {
  const { t } = useTranslation();

  return useMemo(() => {
    const all = [
      sortableColumn(
        'invoice',
        {
          by: (invoice) => invoice.customerName,
          title: t('Features.Billing.Invoices.Columns.customer'),
        },
        (invoice) => <InvoiceCustomerCell invoice={invoice} />,
      ),
      sortableColumn(
        'kind',
        {
          by: (invoice) => instant(invoice.boundaryAt),
          defaultSort: 'desc',
          title: t('Features.Billing.Invoices.Columns.invoice'),
        },
        (invoice) => <InvoiceKindCell invoice={invoice} />,
      ),
      sortableColumn(
        'period',
        {
          by: (invoice) => instant(invoice.serviceFrom),
          title: t('Features.Billing.Invoices.Columns.period'),
        },
        (invoice) => (
          <ServicePeriod
            className="text-sm"
            from={invoice.serviceFrom}
            stacked
            to={invoice.serviceTo}
          />
        ),
      ),
      sortableColumn(
        'total',
        {
          alignRight: true,
          by: (invoice) => invoice.total,
          // An amount is in the minor units of its currency: a column that holds
          // several is ordered by currency, and by amount within one.
          sortFn: (a, b) => compareInvoiceTotals(a.original, b.original),
          title: t('Features.Billing.Invoices.Columns.total'),
        },
        (invoice) => <InvoiceTotalCell invoice={invoice} />,
      ),
      column(
        'status',
        t('Features.Billing.Invoices.Columns.status'),
        (invoice) => <InvoiceStatusBadge invoice={invoice} />,
      ),
      sortableColumn(
        'due',
        {
          by: (invoice) => instant(invoice.dueAt),
          title: t('Features.Billing.Invoices.Columns.due'),
        },
        (invoice) => <DueCell invoice={invoice} />,
      ),
      column(
        'provider',
        t('Features.Billing.Invoices.Columns.provider'),
        (invoice) => <ProviderBadge kind={invoice.providerKind} />,
      ),
      column(
        'handoff',
        t('Features.Billing.Invoices.Columns.handoff'),
        (invoice) => (
          // A sentence ("Waiting for your ERP"), unlike the dates around it: it wraps
          // to two lines before it widens a table that is already the width of the page.
          <HandoffStatusLabel
            className="inline-block max-w-24 whitespace-normal"
            status={invoice.handoffStatus}
          />
        ),
      ),
    ];

    const hidden = new Set(hiddenColumns);

    return all
      .filter(([id]) => !hidden.has(id))
      .map(([, definition]) => definition);
  }, [hiddenColumns, t]);
}

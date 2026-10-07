import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { InvoiceSummary } from '@/api-client';
import type { ColumnDef } from '@/functionals/table';
import { formatUtcDate } from '../logic';
import { HandoffStatusLabel } from './handoff-status-label';
import {
  InvoiceCustomerCell,
  InvoiceKindCell,
  InvoiceTotalCell,
} from './invoice-cells';
import { InvoiceStatusBadge } from './invoice-status-badge';
import { ProviderBadge } from './provider-badge';
import { ServicePeriod } from './service-period';
import { rightAlignedHeader } from './table-headers';

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

/**
 * The columns of the table of invoices, minus the ones a screen leaves out. Nothing
 * sorts: the server orders the list it pages, and sorting what was loaded would put
 * the rest of it in the wrong place. The columns are rebuilt only when the language
 * or the set of columns changes, so `hiddenColumns` has to be the same array from
 * one render to the next.
 */
export function useInvoiceColumns(
  hiddenColumns: readonly InvoicesTableColumn[],
): ColumnDef<InvoiceSummary>[] {
  const { t } = useTranslation();

  return useMemo(() => {
    const all = [
      column(
        'invoice',
        t('Features.Billing.Invoices.Columns.customer'),
        (invoice) => <InvoiceCustomerCell invoice={invoice} />,
      ),
      column(
        'kind',
        t('Features.Billing.Invoices.Columns.invoice'),
        (invoice) => <InvoiceKindCell invoice={invoice} />,
      ),
      column(
        'period',
        t('Features.Billing.Invoices.Columns.period'),
        (invoice) => (
          <ServicePeriod
            className="text-sm"
            from={invoice.serviceFrom}
            stacked
            to={invoice.serviceTo}
          />
        ),
      ),
      column(
        'total',
        rightAlignedHeader(t('Features.Billing.Invoices.Columns.total')),
        (invoice) => <InvoiceTotalCell invoice={invoice} />,
      ),
      column(
        'status',
        t('Features.Billing.Invoices.Columns.status'),
        (invoice) => <InvoiceStatusBadge invoice={invoice} />,
      ),
      column('due', t('Features.Billing.Invoices.Columns.due'), (invoice) => (
        <DueCell invoice={invoice} />
      )),
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

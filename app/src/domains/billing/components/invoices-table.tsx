import { useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { InvoiceSummary } from '@/api-client';
import { DataTable } from '@/functionals/table';
import { cn } from '@/lib/utils';
import {
  type InvoicesTableColumn,
  useInvoiceColumns,
} from './invoices-table-columns';

export type { InvoicesTableColumn } from './invoices-table-columns';

type InvoicesTableProps = {
  /** The body scrolls under the column header, and the table fills the height of its parent. */
  bodyScrollable?: boolean;
  className?: string;
  /** What to say when there is no invoice, which tells why for the screen it is on. */
  emptyMessage?: ReactNode;
  /**
   * Columns the screen leaves out: the customer and the instance, on the page of an
   * instance. The same array from one render to the next, or the columns are rebuilt.
   */
  hiddenColumns?: readonly InvoicesTableColumn[];
  invoices: readonly InvoiceSummary[];
  variant?: 'default' | 'simple';
};

const NO_HIDDEN_COLUMNS: readonly InvoicesTableColumn[] = [];

/**
 * Invoices as rows: who they are for, what they bill, over what period, for how
 * much, in what status, when they are due, who collects them and where they stand
 * in the handoff queue. The list is read whole, so the table sorts it, newest
 * invoice first as it opens, and pages it in the browser like every other table of
 * the console. A row leads to its invoice.
 *
 * It is the table of the organization's invoices, of an instance's and of a
 * customer's, which leave out the columns they already say.
 */
export function InvoicesTable({
  bodyScrollable,
  className,
  emptyMessage,
  hiddenColumns = NO_HIDDEN_COLUMNS,
  invoices,
  variant,
}: InvoicesTableProps) {
  const router = useRouter();
  const columns = useInvoiceColumns(hiddenColumns);

  const getPath = (invoice: InvoiceSummary) =>
    router.buildLocation({
      params: { invoiceId: invoice.id },
      to: '/invoices/$invoiceId',
    }).pathname;

  return (
    <DataTable
      bodyScrollable={bodyScrollable}
      className={cn(className)}
      columns={columns}
      data={invoices as InvoiceSummary[]}
      emptyMessage={emptyMessage}
      getPath={getPath}
      getRowId={(invoice) => invoice.id}
      linkColumnId={hiddenColumns.includes('invoice') ? 'kind' : 'invoice'}
      variant={variant}
    />
  );
}

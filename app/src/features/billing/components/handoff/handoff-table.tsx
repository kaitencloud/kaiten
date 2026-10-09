import { useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { QueuedInvoice } from '@/api-client';
import { DataTable } from '@/functionals/table';
import type { HandoffQueueStatus } from '../../schemas/handoff-search.schema';
import { useHandoffColumns } from './handoff-table-columns';

type HandoffTableProps = {
  /** The body scrolls under the column header, and the table fills its parent. */
  bodyScrollable?: boolean;
  className?: string;
  /** What to say when there is no invoice, which tells why for the part of the queue it is on. */
  emptyMessage?: ReactNode;
  invoices: readonly QueuedInvoice[];
  /** Acknowledges an invoice by hand; absent for a session that may not. */
  onAcknowledge?: (invoice: QueuedInvoice) => void;
  status: HandoffQueueStatus;
};

/**
 * The invoices of the handoff queue, oldest issue first as it opens. The queue is
 * read whole, so the table sorts it and pages it in the browser like every other
 * table of the console. A row leads to its invoice. Nothing here claims an invoice:
 * that is what the consumer of the queue does, and a person acknowledges one only
 * when they booked it themselves.
 */
export function HandoffTable({
  bodyScrollable,
  className,
  emptyMessage,
  invoices,
  onAcknowledge,
  status,
}: HandoffTableProps) {
  const router = useRouter();
  const columns = useHandoffColumns(status, onAcknowledge);

  const getPath = (invoice: QueuedInvoice) =>
    router.buildLocation({
      params: { invoiceId: invoice.id },
      to: '/invoices/$invoiceId',
    }).pathname;

  return (
    <DataTable
      bodyScrollable={bodyScrollable}
      className={className}
      columns={columns}
      data={invoices as QueuedInvoice[]}
      emptyMessage={emptyMessage}
      getPath={getPath}
      getRowId={(invoice) => invoice.id}
      linkColumnId="invoice"
    />
  );
}

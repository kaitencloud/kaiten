import { useRouter } from '@tanstack/react-router';
import type { QueuedInvoice } from '@/api-client';
import { DataTable } from '@/functionals/table';
import type { HandoffQueueStatus } from '../../schemas/handoff-search.schema';
import { useHandoffColumns } from './handoff-table-columns';

type HandoffTableProps = {
  /** The body scrolls under the column header, and the table fills its parent. */
  bodyScrollable?: boolean;
  invoices: readonly QueuedInvoice[];
  /** Acknowledges an invoice by hand; absent for a session that may not. */
  onAcknowledge?: (invoice: QueuedInvoice) => void;
  status: HandoffQueueStatus;
};

/**
 * The invoices of the handoff queue, oldest first. A row leads to its invoice.
 * Nothing here claims an invoice: that is what the consumer of the queue does,
 * and a person acknowledges one only when they booked it themselves.
 */
export function HandoffTable({
  bodyScrollable,
  invoices,
  onAcknowledge,
  status,
}: HandoffTableProps) {
  const router = useRouter();
  const columns = useHandoffColumns(status, onAcknowledge);

  const getPath = (invoice: QueuedInvoice) =>
    router.buildLocation({
      params: { invoiceId: invoice.id },
      to: '/billing/invoices/$invoiceId',
    }).pathname;

  return (
    <DataTable
      bodyScrollable={bodyScrollable}
      className="h-full"
      columns={columns}
      data={invoices as QueuedInvoice[]}
      getPath={getPath}
      getRowId={(invoice) => invoice.id}
      linkColumnId="invoice"
      pagination={false}
    />
  );
}

import type { ReactNode } from 'react';
import type { CheckoutSessionAdmin } from '@/api-client';
import { DataTable } from '@/functionals/table';
import type { CheckoutLabels } from '../../utils/checkout-session';
import { useCheckoutSessionColumns } from './checkout-sessions-columns';

type CheckoutSessionsTableProps = {
  /** What to say when the filters leave no checkout. */
  emptyMessage?: ReactNode;
  /** The names the columns show in place of ids and slugs. */
  labels: CheckoutLabels;
  /** Opens the panel of a checkout. */
  onOpen: (session: CheckoutSessionAdmin) => void;
  sessions: readonly CheckoutSessionAdmin[];
};

const getSessionId = (session: CheckoutSessionAdmin) => session.sessionId;

/**
 * The checkouts as rows, sorted and paged in the browser like every other list: the page
 * holds the whole list. The e-mail of a row is the link that opens the panel of its checkout,
 * and a click anywhere else on the row opens it too; the links to the customer and the
 * instance the checkout created lead away and do not open it.
 */
export function CheckoutSessionsTable({
  emptyMessage,
  labels,
  onOpen,
  sessions,
}: CheckoutSessionsTableProps) {
  const columns = useCheckoutSessionColumns(labels);

  return (
    <DataTable
      bodyScrollable
      className="h-full"
      columns={columns}
      data={sessions as CheckoutSessionAdmin[]}
      emptyMessage={emptyMessage}
      getRowId={getSessionId}
      onClickRow={(row) => onOpen(row.original)}
    />
  );
}

import type { ReactNode } from 'react';
import type { CheckoutSessionAdmin } from '@/api-client';
import { DataTable } from '@/functionals/table';
import { useCheckoutSessionColumns } from './checkout-sessions-columns';

type CheckoutSessionsTableProps = {
  /** What to say when there is no checkout, which tells why for the state of the list. */
  emptyMessage?: ReactNode;
  /** The label of each key by its id, which the key column shows. */
  keyLabels: Readonly<Record<string, string>>;
  /** Opens the panel of a checkout. */
  onOpen: (session: CheckoutSessionAdmin) => void;
  sessions: readonly CheckoutSessionAdmin[];
};

const getSessionId = (session: CheckoutSessionAdmin) => session.sessionId;

/**
 * The checkouts as rows, sorted and paged in the browser like every other list: the page
 * holds the whole list. A row opens the panel of its checkout; the links in it lead to the
 * customer and the instance the checkout created, and do not open the panel.
 */
export function CheckoutSessionsTable({
  emptyMessage,
  keyLabels,
  onOpen,
  sessions,
}: CheckoutSessionsTableProps) {
  const columns = useCheckoutSessionColumns(keyLabels);

  return (
    <DataTable
      bodyScrollable
      className="h-full"
      columns={columns}
      data={sessions as CheckoutSessionAdmin[]}
      emptyMessage={emptyMessage}
      enableRowKeyboardNavigation
      getRowId={getSessionId}
      onClickRow={(row) => onOpen(row.original)}
    />
  );
}

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CheckoutSessionAdmin } from '@/api-client';
import { type ColumnDef, dataTableSortableHeader } from '@/functionals/table';
import {
  CHECKOUT_SESSION_STATUSES,
  type CheckoutLabels,
  nameOrId,
} from '../../utils/checkout-session';
import {
  CheckoutCustomerCell,
  CheckoutDueTodayCell,
  CheckoutEmailCell,
  CheckoutInstanceCell,
  CheckoutInstantCell,
  CheckoutKeyCell,
  CheckoutLicenseCell,
} from './checkout-session-cells';
import { CheckoutSessionStatusBadge } from './checkout-session-status-badge';

const timeOf = (value: string | null) => (value ? Date.parse(value) : 0);

/**
 * The columns of the checkouts: where each stands, who started it, what it asks for and
 * how much today, when it was made and when it expires, the customer and the instance it
 * created, and last the key whose page started it. The dates come before the links so that
 * the column the list is sorted by is on screen without scrolling sideways; when it was
 * closed is in the panel. The list is read whole, so the table sorts it in the browser,
 * newest first.
 */
export function useCheckoutSessionColumns(
  labels: CheckoutLabels,
): ColumnDef<CheckoutSessionAdmin>[] {
  const { t } = useTranslation();

  return useMemo<ColumnDef<CheckoutSessionAdmin>[]>(() => {
    const header = (key: string) =>
      t(`Pages.Customers.CheckoutSessions.Columns.${key}`);

    return [
      {
        accessorFn: (session) =>
          CHECKOUT_SESSION_STATUSES.indexOf(session.status),
        cell: ({ row }) => (
          <CheckoutSessionStatusBadge status={row.original.status} />
        ),
        header: dataTableSortableHeader(header('status')),
        id: 'status',
      },
      {
        accessorFn: (session) => session.email,
        cell: ({ row }) => <CheckoutEmailCell session={row.original} />,
        header: dataTableSortableHeader(header('email')),
        id: 'email',
        meta: { cellClassName: 'min-w-52', headerClassName: 'min-w-52' },
      },
      {
        accessorFn: (session) => nameOrId(labels.licenses, session.licenseSlug),
        cell: ({ row }) => (
          <CheckoutLicenseCell labels={labels} session={row.original} />
        ),
        header: dataTableSortableHeader(header('license')),
        id: 'license',
      },
      {
        accessorFn: (session) => session.dueToday.total,
        cell: ({ row }) => <CheckoutDueTodayCell session={row.original} />,
        header: dataTableSortableHeader(header('dueToday')),
        id: 'dueToday',
      },
      {
        accessorFn: (session) => timeOf(session.createdAt),
        cell: ({ row }) => (
          <CheckoutInstantCell value={row.original.createdAt} />
        ),
        header: dataTableSortableHeader(header('created')),
        id: 'created',
        meta: { defaultSort: 'desc' },
      },
      {
        accessorFn: (session) => timeOf(session.expiresAt),
        cell: ({ row }) => (
          <CheckoutInstantCell value={row.original.expiresAt} />
        ),
        header: dataTableSortableHeader(header('expires')),
        id: 'expires',
      },
      {
        accessorFn: (session) => session.customerSlug ?? '',
        cell: ({ row }) => (
          <CheckoutCustomerCell labels={labels} session={row.original} />
        ),
        enableSorting: false,
        header: header('customer'),
        id: 'customer',
      },
      {
        accessorFn: (session) => session.instanceSlug ?? '',
        cell: ({ row }) => (
          <CheckoutInstanceCell labels={labels} session={row.original} />
        ),
        enableSorting: false,
        header: header('instance'),
        id: 'instance',
      },
      {
        accessorFn: (session) =>
          nameOrId(labels.keys, session.publishableKeyId),
        cell: ({ row }) => (
          <CheckoutKeyCell
            keyLabels={labels.keys}
            publishableKeyId={row.original.publishableKeyId}
          />
        ),
        enableSorting: false,
        header: header('key'),
        id: 'key',
      },
    ];
  }, [labels, t]);
}

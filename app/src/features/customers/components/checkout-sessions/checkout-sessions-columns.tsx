import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CheckoutSessionAdmin } from '@/api-client';
import { type ColumnDef, dataTableSortableHeader } from '@/functionals/table';
import { CHECKOUT_SESSION_STATUSES } from '../../utils/checkout-session';
import {
  CheckoutCustomerCell,
  CheckoutDueTodayCell,
  CheckoutEmailCell,
  CheckoutInstanceCell,
  CheckoutInstantCell,
  CheckoutKeyCell,
  CheckoutPlanCell,
} from './checkout-session-cells';
import { CheckoutSessionStatusBadge } from './checkout-session-status-badge';

const timeOf = (value: string | null) => (value ? Date.parse(value) : 0);

/**
 * The columns of the checkouts: where each stands, who started it, what it asks for and
 * how much today, which key's page started it, the customer and the instance it created,
 * and when it was made and closed. The list is read whole, so the table sorts it in the
 * browser, newest first.
 */
export function useCheckoutSessionColumns(
  keyLabels: Readonly<Record<string, string>>,
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
      },
      {
        accessorFn: (session) => session.licenseSlug,
        cell: ({ row }) => <CheckoutPlanCell session={row.original} />,
        header: dataTableSortableHeader(header('plan')),
        id: 'plan',
      },
      {
        accessorFn: (session) => session.dueToday.total,
        cell: ({ row }) => <CheckoutDueTodayCell session={row.original} />,
        header: dataTableSortableHeader(header('dueToday')),
        id: 'dueToday',
      },
      {
        accessorFn: (session) =>
          keyLabels[session.publishableKeyId] ?? session.publishableKeyId,
        cell: ({ row }) => (
          <CheckoutKeyCell
            keyLabels={keyLabels}
            publishableKeyId={row.original.publishableKeyId}
          />
        ),
        enableSorting: false,
        header: header('key'),
        id: 'key',
      },
      {
        accessorFn: (session) => session.customerSlug ?? '',
        cell: ({ row }) => <CheckoutCustomerCell session={row.original} />,
        enableSorting: false,
        header: header('customer'),
        id: 'customer',
      },
      {
        accessorFn: (session) => session.instanceSlug ?? '',
        cell: ({ row }) => <CheckoutInstanceCell session={row.original} />,
        enableSorting: false,
        header: header('instance'),
        id: 'instance',
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
        accessorFn: (session) => timeOf(session.closedAt),
        cell: ({ row }) => (
          <CheckoutInstantCell value={row.original.closedAt} />
        ),
        header: dataTableSortableHeader(header('closed')),
        id: 'closed',
      },
    ];
  }, [keyLabels, t]);
}

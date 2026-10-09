import { useRouter } from '@tanstack/react-router';
import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import {
  formatUtcDate,
  getVoucherStatus,
  isVoucherScheduled,
  VoucherStatusBadge,
  VoucherTypeBadge,
} from '@/domains/billing';
import {
  type ColumnDef,
  DataTable,
  dataTableSortableHeader,
} from '@/functionals/table';

type VouchersTableProps = {
  /** The names of the customers vouchers are reserved for, by slug. */
  customerNames: Readonly<Record<string, string>>;
  /** What to say when there is no voucher, which tells why for the state of the list. */
  emptyMessage?: ReactNode;
  vouchers: readonly Voucher[];
};

function RedeemedCell({ voucher }: { voucher: Voucher }) {
  const { t } = useTranslation();

  return (
    <span className="text-sm tabular-nums">
      {voucher.maxRedemptions === undefined
        ? t('Pages.Vouchers.List.redeemedUnbounded', {
            count: voucher.redemptionsCount,
          })
        : t('Pages.Vouchers.List.redeemed', {
            count: voucher.redemptionsCount,
            max: voucher.maxRedemptions,
          })}
    </span>
  );
}

/** The state of a voucher, and when an active one cannot be redeemed yet. */
function StatusCell({ voucher }: { voucher: Voucher }) {
  const { i18n, t } = useTranslation();
  const scheduled =
    getVoucherStatus(voucher) === 'ACTIVE' && isVoucherScheduled(voucher);

  return (
    <div className="min-w-0 space-y-1">
      <VoucherStatusBadge voucher={voucher} />
      {scheduled && voucher.startsAt ? (
        <p className="text-xs text-muted-foreground">
          {t('Pages.Vouchers.List.startsOn', {
            date: formatUtcDate(voucher.startsAt, i18n.language),
          })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Vouchers as rows: what each is called, the code that redeems it, what kind it is,
 * its state, how many times it was redeemed of how many it can be, until when, and
 * whom it is reserved for. The list is read whole, so the table sorts and pages it in
 * the browser, as it does every other. A row leads to its voucher.
 */
export function VouchersTable({
  customerNames,
  emptyMessage,
  vouchers,
}: VouchersTableProps) {
  const { i18n, t } = useTranslation();
  const router = useRouter();

  const columns = useMemo<ColumnDef<Voucher>[]>(
    () => [
      {
        accessorFn: (voucher) => voucher.name,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
        header: dataTableSortableHeader(t('Pages.Vouchers.List.Columns.name')),
        id: 'name',
      },
      {
        accessorFn: (voucher) => voucher.code ?? voucher.codeHint,
        cell: ({ row }) =>
          row.original.code ? (
            <span className="font-mono text-sm">{row.original.code}</span>
          ) : (
            <span className="font-mono text-sm text-muted-foreground">
              {t('Pages.Vouchers.List.codeHint', {
                hint: row.original.codeHint,
              })}
            </span>
          ),
        header: t('Pages.Vouchers.List.Columns.code'),
        id: 'code',
      },
      {
        accessorFn: (voucher) => voucher.voucherType,
        cell: ({ row }) => <VoucherTypeBadge type={row.original.voucherType} />,
        header: dataTableSortableHeader(t('Pages.Vouchers.List.Columns.type')),
        id: 'type',
      },
      {
        accessorFn: (voucher) => getVoucherStatus(voucher),
        cell: ({ row }) => <StatusCell voucher={row.original} />,
        header: dataTableSortableHeader(
          t('Pages.Vouchers.List.Columns.status'),
        ),
        id: 'status',
      },
      {
        accessorFn: (voucher) => voucher.redemptionsCount,
        cell: ({ row }) => <RedeemedCell voucher={row.original} />,
        header: dataTableSortableHeader(
          t('Pages.Vouchers.List.Columns.redeemed'),
        ),
        id: 'redeemed',
      },
      {
        accessorFn: (voucher) =>
          voucher.expiresAt ? Date.parse(voucher.expiresAt) : Number.MAX_VALUE,
        cell: ({ row }) =>
          row.original.expiresAt ? (
            <span className="text-sm">
              {formatUtcDate(row.original.expiresAt, i18n.language)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t('Pages.Vouchers.List.noEnd')}
            </span>
          ),
        header: dataTableSortableHeader(
          t('Pages.Vouchers.List.Columns.expires'),
        ),
        id: 'expires',
      },
      {
        accessorFn: (voucher) =>
          customerNames[voucher.restrictedCustomerSlug ?? ''] ??
          voucher.restrictedCustomerSlug ??
          '',
        cell: ({ row }) => {
          const slug = row.original.restrictedCustomerSlug;

          return slug ? (
            <span className="text-sm">{customerNames[slug] ?? slug}</span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t('Pages.Vouchers.List.anyCustomer')}
            </span>
          );
        },
        header: dataTableSortableHeader(
          t('Pages.Vouchers.List.Columns.customer'),
        ),
        id: 'customer',
      },
    ],
    [customerNames, i18n.language, t],
  );

  const getPath = (voucher: Voucher) =>
    router.buildLocation({
      params: { voucherId: voucher.id },
      to: '/vouchers/$voucherId',
    }).pathname;

  return (
    <DataTable
      bodyScrollable
      className="h-full"
      columns={columns}
      data={vouchers as Voucher[]}
      emptyMessage={emptyMessage}
      getPath={getPath}
      getRowId={(voucher) => voucher.id}
      linkColumnId="name"
    />
  );
}

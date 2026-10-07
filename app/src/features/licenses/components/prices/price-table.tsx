import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement, LicenseEntitlement, Price } from '@/api-client';
import { type ColumnDef, DataTable } from '@/functionals/table';
import {
  PriceAmountCell,
  PriceBilledCell,
  PriceLabelCell,
  PriceMeterCell,
  PriceShapeCell,
  PriceStatusCell,
} from './price-table-cells';

type PriceTableProps = {
  entitlementBySlug: ReadonlyMap<string, Entitlement>;
  grantBySlug: ReadonlyMap<string, LicenseEntitlement>;
  /** The prices of the version, in display order. */
  prices: Price[];
};

const entitlementOf = (
  price: Price,
  entitlementBySlug: ReadonlyMap<string, Entitlement>,
) =>
  price.metered
    ? entitlementBySlug.get(price.metered.entitlementSlug)
    : undefined;

/**
 * The prices of a license version, in the order the API gives them: display
 * order, then id. A deprecated price stays in the list, dimmed, with the day it
 * was retired, since subscriptions pinned to it keep being billed from it.
 */
export function PriceTable({
  entitlementBySlug,
  grantBySlug,
  prices,
}: PriceTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<ColumnDef<Price>[]>(
    () => [
      {
        id: 'label',
        enableSorting: false,
        header: t('Pages.Licenses.Prices.Table.Columns.price'),
        cell: ({ row }) => (
          <PriceLabelCell
            entitlement={entitlementOf(row.original, entitlementBySlug)}
            price={row.original}
          />
        ),
      },
      {
        id: 'shape',
        enableSorting: false,
        header: t('Pages.Licenses.Prices.Table.Columns.shape'),
        cell: ({ row }) => <PriceShapeCell price={row.original} />,
      },
      {
        id: 'meter',
        enableSorting: false,
        header: t('Pages.Licenses.Prices.Table.Columns.meter'),
        cell: ({ row }) => (
          <PriceMeterCell
            entitlement={entitlementOf(row.original, entitlementBySlug)}
            grant={
              row.original.metered
                ? grantBySlug.get(row.original.metered.entitlementSlug)
                : undefined
            }
            price={row.original}
          />
        ),
      },
      {
        id: 'amount',
        enableSorting: false,
        header: t('Pages.Licenses.Prices.Table.Columns.amount'),
        cell: ({ row }) => (
          <PriceAmountCell
            entitlement={entitlementOf(row.original, entitlementBySlug)}
            price={row.original}
          />
        ),
      },
      {
        id: 'billed',
        enableSorting: false,
        header: t('Pages.Licenses.Prices.Table.Columns.billed'),
        cell: ({ row }) => <PriceBilledCell price={row.original} />,
      },
      {
        id: 'status',
        enableSorting: false,
        header: t('Pages.Licenses.Prices.Table.Columns.status'),
        cell: ({ row }) => <PriceStatusCell price={row.original} />,
      },
    ],
    [entitlementBySlug, grantBySlug, t],
  );

  return (
    <DataTable
      columns={columns}
      data={prices}
      emptyMessage={t('Pages.Licenses.Prices.Table.empty')}
      getRowClassName={(price) =>
        price.status === 'DEPRECATED' ? 'opacity-60' : undefined
      }
      getRowId={(price) => price.id}
      pagination={false}
      variant="simple"
    />
  );
}

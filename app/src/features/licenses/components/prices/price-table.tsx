import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement, LicenseEntitlement, Price } from '@/api-client';
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
} from '@/functionals/table';
import { getPriceLabel } from '../../utils/license-price-display';
import type { PriceRules } from '../../utils/license-price.utils';
import { PriceAmount } from './price-amount';
import { PriceRowActions } from './price-row-actions';
import {
  PriceBilledCell,
  PriceLabelCell,
  PriceMeterCell,
  PriceShapeCell,
  PriceStatusCell,
} from './price-table-cells';

type PriceTableProps = {
  entitlementBySlug: ReadonlyMap<string, Entitlement>;
  grantBySlug: ReadonlyMap<string, LicenseEntitlement>;
  licenseSlug: string;
  onDeprecate: (price: Price) => void;
  /** The prices of the version, in display order. */
  prices: Price[];
  rules: PriceRules;
};

const entitlementOf = (
  price: Price,
  entitlementBySlug: ReadonlyMap<string, Entitlement>,
) =>
  price.metered
    ? entitlementBySlug.get(price.metered.entitlementSlug)
    : undefined;

type PriceColumnsOptions = Omit<PriceTableProps, 'prices'>;

// What the table says of a price, a column each: what it is called, its shape,
// what it meters, what it charges, how it is billed, its status, and what can be
// done to it.
function usePriceColumns({
  entitlementBySlug,
  grantBySlug,
  licenseSlug,
  onDeprecate,
  rules,
}: PriceColumnsOptions) {
  const { t } = useTranslation();

  return useMemo<ColumnDef<Price>[]>(
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
          <PriceAmount
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
      createActionsColumn<Price>((price) => (
        <PriceRowActions
          label={getPriceLabel(
            price,
            entitlementOf(price, entitlementBySlug),
            t,
          )}
          licenseSlug={licenseSlug}
          onDeprecate={onDeprecate}
          price={price}
          rules={rules}
        />
      )),
    ],
    [entitlementBySlug, grantBySlug, licenseSlug, onDeprecate, rules, t],
  );
}

/**
 * The prices of a license version, in the order the API gives them: display
 * order, then id. A deprecated price stays in the list, dimmed, with the day it
 * was retired, since subscriptions pinned to it keep being billed from it.
 */
export function PriceTable({ prices, ...columnOptions }: PriceTableProps) {
  const { t } = useTranslation();
  const columns = usePriceColumns(columnOptions);

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

import { Star } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement, Price } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import {
  BILLING_PERIOD_LABEL_KEYS,
  BILLING_TIMING_LABEL_KEYS,
  formatUtcDate,
  getPriceLabel,
  PRICE_STATUS_LABEL_KEYS,
  PriceAmount,
  PriceMeterCell,
  PriceShapeCell,
} from '@/domains/billing';
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
} from '@/functionals/table';
import { AddonPriceRowActions } from './addon-price-row-actions';

type AddonPriceTableProps = {
  /** The catalogue, by slug, for the name and the unit of what a metered price measures. */
  entitlementBySlug: ReadonlyMap<string, Entitlement>;
  onDeprecate: (price: Price) => void;
  /** The prices of the version, flat fees and metered ones, in the order the API gives them. */
  prices: readonly Price[];
};

const entitlementOf = (
  price: Price,
  entitlementBySlug: ReadonlyMap<string, Entitlement>,
) =>
  price.metered
    ? entitlementBySlug.get(price.metered.entitlementSlug)
    : undefined;

function LabelCell({
  entitlement,
  price,
}: {
  entitlement?: Entitlement;
  price: Price;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2 whitespace-normal">
      <span className="font-medium">
        {getPriceLabel(price, entitlement, t)}
      </span>
      {price.isDefault ? (
        <Badge className="gap-1" variant="default">
          <Star className="size-3" />
          {t('Pages.Addons.Prices.defaultBadge')}
        </Badge>
      ) : null}
    </div>
  );
}

// A flat fee is billed for a period, in advance unless it says otherwise; a metered price
// is billed on the subscription's own period, in arrears.
function BilledCell({ price }: { price: Price }) {
  const { t } = useTranslation();
  const timing = t(BILLING_TIMING_LABEL_KEYS[price.billingTiming]);

  return (
    <span>
      {price.billingPeriod
        ? `${t(BILLING_PERIOD_LABEL_KEYS[price.billingPeriod])} · ${timing}`
        : timing}
    </span>
  );
}

function StatusCell({ price }: { price: Price }) {
  const { i18n, t } = useTranslation();

  return (
    <div className="space-y-0.5 whitespace-normal">
      <Badge variant={price.status === 'ACTIVE' ? 'success' : 'outline'}>
        {t(PRICE_STATUS_LABEL_KEYS[price.status])}
      </Badge>
      {price.deprecatedAt ? (
        <p className="text-xs text-muted-foreground">
          {t('Pages.Addons.Prices.deprecatedOn', {
            date: formatUtcDate(price.deprecatedAt, i18n.language),
          })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The prices of a version, in the order the API gives them: display order, then id.
 * A flat fee is read by its period, a metered price by what it measures and what it
 * charges per sale unit. A deprecated price stays in the list, in muted text, with the
 * day it was retired, since an instance billed from it keeps being billed from it.
 */
export function AddonPriceTable({
  entitlementBySlug,
  onDeprecate,
  prices,
}: AddonPriceTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<ColumnDef<Price>[]>(
    () => [
      {
        cell: ({ row }) => (
          <LabelCell
            entitlement={entitlementOf(row.original, entitlementBySlug)}
            price={row.original}
          />
        ),
        enableSorting: false,
        header: t('Pages.Addons.Prices.Table.Columns.price'),
        id: 'label',
      },
      {
        cell: ({ row }) => <PriceShapeCell price={row.original} />,
        enableSorting: false,
        header: t('Pages.Addons.Prices.Table.Columns.shape'),
        id: 'shape',
      },
      {
        cell: ({ row }) => (
          <PriceMeterCell
            entitlement={entitlementOf(row.original, entitlementBySlug)}
            price={row.original}
            scope="instance"
          />
        ),
        enableSorting: false,
        header: t('Pages.Addons.Prices.Table.Columns.meter'),
        id: 'meter',
      },
      {
        cell: ({ row }) => (
          <PriceAmount
            entitlement={entitlementOf(row.original, entitlementBySlug)}
            price={row.original}
          />
        ),
        enableSorting: false,
        header: t('Pages.Addons.Prices.Table.Columns.amount'),
        id: 'amount',
      },
      {
        cell: ({ row }) => <BilledCell price={row.original} />,
        enableSorting: false,
        header: t('Pages.Addons.Prices.Table.Columns.billed'),
        id: 'billed',
      },
      {
        cell: ({ row }) => <StatusCell price={row.original} />,
        enableSorting: false,
        header: t('Pages.Addons.Prices.Table.Columns.status'),
        id: 'status',
      },
      createActionsColumn<Price>((price) => (
        <AddonPriceRowActions
          entitlement={entitlementOf(price, entitlementBySlug)}
          onDeprecate={onDeprecate}
          price={price}
        />
      )),
    ],
    [entitlementBySlug, onDeprecate, t],
  );

  return (
    <DataTable
      columns={columns}
      data={[...prices]}
      emptyMessage={t('Pages.Addons.Prices.Table.empty')}
      // A deprecated price reads as set aside by its muted text, not by an opacity over
      // the row: that would drag the text of the row, which a person still reads (what
      // it charged, when it was retired), under the contrast floor.
      getRowClassName={(price) =>
        price.status === 'DEPRECATED' ? 'text-muted-foreground' : undefined
      }
      getRowId={(price) => price.id}
      pagination={false}
      variant="simple"
    />
  );
}

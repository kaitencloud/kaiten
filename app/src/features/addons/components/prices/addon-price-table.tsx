import { Star } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Price } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import {
  BILLING_PERIOD_LABEL_KEYS,
  BILLING_TIMING_LABEL_KEYS,
  formatUtcDate,
  getPriceLabel,
  PRICE_STATUS_LABEL_KEYS,
  PriceAmount,
} from '@/domains/billing';
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
} from '@/functionals/table';
import { AddonPriceRowActions } from './addon-price-row-actions';

type AddonPriceTableProps = {
  onDeprecate: (price: Price) => void;
  /** The prices the console lists: the flat fees, in the order the API gives them. */
  prices: readonly Price[];
};

function LabelCell({ price }: { price: Price }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2 whitespace-normal">
      <span className="font-medium">{getPriceLabel(price, undefined, t)}</span>
      {price.isDefault ? (
        <Badge className="gap-1" variant="default">
          <Star className="size-3" />
          {t('Pages.Addons.Prices.defaultBadge')}
        </Badge>
      ) : null}
    </div>
  );
}

// A flat fee is billed for a period, in advance unless it says otherwise.
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
 * A deprecated price stays in the list, in muted text, with the day it was retired,
 * since an instance billed from it keeps being billed from it.
 */
export function AddonPriceTable({ onDeprecate, prices }: AddonPriceTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<ColumnDef<Price>[]>(
    () => [
      {
        cell: ({ row }) => <LabelCell price={row.original} />,
        enableSorting: false,
        header: t('Pages.Addons.Prices.Table.Columns.price'),
        id: 'label',
      },
      {
        cell: ({ row }) => <PriceAmount price={row.original} />,
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
        <AddonPriceRowActions onDeprecate={onDeprecate} price={price} />
      )),
    ],
    [onDeprecate, t],
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

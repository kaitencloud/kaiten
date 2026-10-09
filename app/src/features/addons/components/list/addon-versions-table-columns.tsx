import { Star } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Addon } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { type ColumnDef, dataTableSortableHeader } from '@/functionals/table';
import { PRICING_TYPE_LABEL_KEYS } from '../../utils/addon-labels';
import { AddonLifecycleBadge } from '../actions/addon-lifecycle-badge';
import { AddonVersionsTableActions } from './addon-versions-table-actions';

// A number and the actions sit at the right of their column, under a header that
// does too.
const rightHeader = (title: string) => () => (
  <div className="text-right">{title}</div>
);

function PricingTypeCell({ addon }: { addon: Addon }) {
  const { t } = useTranslation();

  return (
    <Badge variant="outline">
      {t(PRICING_TYPE_LABEL_KEYS[addon.pricingType])}
    </Badge>
  );
}

function DefaultCell({ isDefault }: { isDefault: boolean }) {
  const { t } = useTranslation();

  return isDefault ? (
    <Badge className="gap-1" variant="default">
      <Star className="size-3" />
      {t('Pages.Addons.VersionsTable.default')}
    </Badge>
  ) : (
    <span className="text-muted-foreground">-</span>
  );
}

function MaxQuantityCell({ maxQuantity }: { maxQuantity: number | undefined }) {
  const { t } = useTranslation();

  return maxQuantity === undefined ? (
    <span className="text-muted-foreground">
      {t('Pages.Addons.VersionsTable.unbounded')}
    </span>
  ) : (
    <div className="text-right tabular-nums">{maxQuantity}</div>
  );
}

/**
 * The columns of the versions of a family: its name and number, how it is sold, its
 * lifecycle state, whether it is the default, the most an instance can hold, and what
 * can be done to it.
 */
export function useAddonVersionsColumns() {
  const { t } = useTranslation();

  return useMemo<ColumnDef<Addon>[]>(
    () => [
      {
        accessorFn: (addon) => addon.versionName,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.versionName}</span>
        ),
        header: dataTableSortableHeader(
          t('Pages.Addons.VersionsTable.Columns.versionName'),
        ),
        id: 'versionName',
      },
      {
        accessorKey: 'version',
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{row.original.version}</div>
        ),
        enableSorting: false,
        header: rightHeader(t('Pages.Addons.VersionsTable.Columns.version')),
      },
      {
        accessorKey: 'pricingType',
        cell: ({ row }) => <PricingTypeCell addon={row.original} />,
        enableSorting: false,
        header: t('Pages.Addons.VersionsTable.Columns.pricingType'),
      },
      {
        accessorKey: 'lifecycleState',
        cell: ({ row }) => <AddonLifecycleBadge addon={row.original} />,
        enableSorting: false,
        header: t('Pages.Addons.VersionsTable.Columns.lifecycleState'),
      },
      {
        accessorKey: 'isDefault',
        cell: ({ row }) => <DefaultCell isDefault={row.original.isDefault} />,
        enableSorting: false,
        header: t('Pages.Addons.VersionsTable.Columns.default'),
      },
      {
        accessorKey: 'maxQuantity',
        cell: ({ row }) => (
          <MaxQuantityCell maxQuantity={row.original.maxQuantity} />
        ),
        enableSorting: false,
        header: rightHeader(
          t('Pages.Addons.VersionsTable.Columns.maxQuantity'),
        ),
      },
      // Present whatever the family's size: even a lone version can be published,
      // archived or unarchived.
      {
        cell: ({ row }) => (
          <div className="text-right">
            <AddonVersionsTableActions addon={row.original} />
          </div>
        ),
        enableSorting: false,
        header: rightHeader(t('Pages.Addons.VersionsTable.Columns.actions')),
        id: 'actions',
      },
    ],
    [t],
  );
}

import { Star } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useBillingCapabilities } from '@/domains/billing';
import { type ColumnDef, dataTableSortableHeader } from '@/functionals/table';
import { capitalizeFromUpperCase } from '@/lib/utils';
import type { LicenseWithInstances } from '../types';
import {
  getPricingType,
  PRICING_TYPE_LABEL_KEYS,
} from '../utils/license-commercial.utils';
import { getLicenseLifecycleState } from '../utils/license-lifecycle.utils';
import { LicenseLifecycleBadge } from './license-lifecycle-badge';
import { LicenseVersionsTableActions } from './license-versions-table-actions';

const getLicenseTypeBadgeVariant = (type: LicenseWithInstances['type']) => {
  if (type === 'PAID') {
    return 'default' as const;
  }

  if (type === 'DEVELOPMENT') {
    return 'secondary' as const;
  }

  return 'outline' as const;
};

// A count, a number and the actions sit at the right of their column, under a
// header that does too.
const rightHeader = (title: string) => () => (
  <div className="text-right">{title}</div>
);

function TypeCell({ type }: { type: LicenseWithInstances['type'] }) {
  const { t } = useTranslation();

  return (
    <Badge variant={getLicenseTypeBadgeVariant(type)}>
      {t(`Pages.Licenses.Mutation.Form.Types.${capitalizeFromUpperCase(type)}`)}
    </Badge>
  );
}

function PricingTypeCell({ license }: { license: LicenseWithInstances }) {
  const { t } = useTranslation();

  return (
    <Badge variant="outline">
      {t(PRICING_TYPE_LABEL_KEYS[getPricingType(license)])}
    </Badge>
  );
}

function DefaultCell({ isDefault }: { isDefault: boolean }) {
  const { t } = useTranslation();

  return isDefault ? (
    <Badge variant="default" className="gap-1">
      <Star className="size-3" />
      {t('Pages.Licenses.VersionsTable.default')}
    </Badge>
  ) : (
    <span className="text-muted-foreground">-</span>
  );
}

/**
 * The columns of the versions of a family: its name and number, its type, how it
 * is sold where billing is on, its lifecycle state, whether it is the default,
 * the instances on it, and what can be done to it.
 */
export function useLicenseVersionsColumns() {
  const { t } = useTranslation();
  // How a version is sold is billing's: where billing is not there, every
  // version would read "Custom", which says nothing.
  const { isEnabled: hasBilling } = useBillingCapabilities();
  const unknownVersionLabel = t('Pages.Licenses.List.unknownVersion');

  return useMemo<ColumnDef<LicenseWithInstances>[]>(
    () => [
      {
        accessorFn: (license) =>
          license.versionName?.trim() || unknownVersionLabel,
        id: 'versionName',
        header: dataTableSortableHeader(
          t('Pages.Licenses.VersionsTable.Columns.versionName'),
        ),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.versionName?.trim() || unknownVersionLabel}
          </span>
        ),
      },
      {
        accessorKey: 'version',
        enableSorting: false,
        header: rightHeader(t('Pages.Licenses.VersionsTable.Columns.version')),
        cell: ({ row }) => (
          <div className="text-right">{row.original.version}</div>
        ),
      },
      {
        accessorKey: 'type',
        enableSorting: false,
        header: t('Pages.Licenses.VersionsTable.Columns.type'),
        cell: ({ row }) => <TypeCell type={row.original.type} />,
      },
      ...(hasBilling
        ? [
            {
              accessorFn: (license: LicenseWithInstances) =>
                getPricingType(license),
              id: 'pricingType',
              enableSorting: false,
              header: t('Pages.Licenses.VersionsTable.Columns.pricingType'),
              cell: ({ row }: { row: { original: LicenseWithInstances } }) => (
                <PricingTypeCell license={row.original} />
              ),
            } satisfies ColumnDef<LicenseWithInstances>,
          ]
        : []),
      {
        accessorFn: (license) => getLicenseLifecycleState(license),
        id: 'lifecycleState',
        enableSorting: false,
        header: t('Pages.Licenses.VersionsTable.Columns.lifecycleState'),
        cell: ({ row }) => <LicenseLifecycleBadge license={row.original} />,
      },
      {
        accessorKey: 'isDefault',
        enableSorting: false,
        header: t('Pages.Licenses.VersionsTable.Columns.default'),
        cell: ({ row }) => <DefaultCell isDefault={row.original.isDefault} />,
      },
      {
        accessorKey: 'nbInstances',
        enableSorting: false,
        header: rightHeader(
          t('Pages.Licenses.VersionsTable.Columns.instances'),
        ),
        cell: ({ row }) => (
          <div className="text-right">{row.original.nbInstances}</div>
        ),
      },
      // Present whatever the family's size: even a lone version can be
      // published, archived or unarchived.
      {
        id: 'actions',
        enableSorting: false,
        header: rightHeader(t('Pages.Licenses.VersionsTable.Columns.actions')),
        cell: ({ row }) => (
          <div className="text-right">
            <LicenseVersionsTableActions license={row.original} />
          </div>
        ),
      },
    ],
    [hasBilling, t, unknownVersionLabel],
  );
}

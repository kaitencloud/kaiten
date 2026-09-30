import { Badge } from '@/components/ui/badge';
import { useRouter } from '@tanstack/react-router';
import { Star } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ColumnDef,
  DataTable,
  dataTableSortableHeader,
} from '@/functionals/table';
import { capitalizeFromUpperCase } from '@/lib/utils';
import type { LicenseWithInstances } from '../types';
import { getLicenseLifecycleState } from '../utils/license-lifecycle.utils';
import { LicenseLifecycleBadge } from './license-lifecycle-badge';
import { LicenseVersionsTableActions } from './license-versions-table-actions';

type LicenseVersionsTableProps = {
  licenses: LicenseWithInstances[];
};

const getLicenseTypeBadgeVariant = (type: LicenseWithInstances['type']) => {
  if (type === 'PAID') {
    return 'default' as const;
  }

  if (type === 'DEVELOPMENT') {
    return 'secondary' as const;
  }

  return 'outline' as const;
};

export const LicenseVersionsTable = ({
  licenses,
}: LicenseVersionsTableProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const unknownVersionLabel = t('Pages.Licenses.List.unknownVersion');

  const columns = useMemo<ColumnDef<LicenseWithInstances>[]>(() => {
    return [
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
        header: () => (
          <div className="text-right">
            {t('Pages.Licenses.VersionsTable.Columns.version')}
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right">{row.original.version}</div>
        ),
      },
      {
        accessorKey: 'type',
        enableSorting: false,
        header: t('Pages.Licenses.VersionsTable.Columns.type'),
        cell: ({ row }) => (
          <Badge variant={getLicenseTypeBadgeVariant(row.original.type)}>
            {t(
              `Pages.Licenses.Mutation.Form.Types.${capitalizeFromUpperCase(row.original.type)}`,
            )}
          </Badge>
        ),
      },
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
        cell: ({ row }) =>
          row.original.isDefault ? (
            <Badge variant="default" className="gap-1">
              <Star className="size-3" />
              {t('Pages.Licenses.VersionsTable.default')}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: 'nbInstances',
        enableSorting: false,
        header: () => (
          <div className="text-right">
            {t('Pages.Licenses.VersionsTable.Columns.instances')}
          </div>
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
        header: () => (
          <div className="text-right">
            {t('Pages.Licenses.VersionsTable.Columns.actions')}
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <LicenseVersionsTableActions license={row.original} />
          </div>
        ),
      },
    ];
  }, [t, unknownVersionLabel]);

  const getLicensePath = (license: LicenseWithInstances) =>
    license.slug
      ? router.buildLocation({
          to: '/licenses/$licenseSlug',
          params: { licenseSlug: license.slug },
        }).pathname
      : undefined;

  return (
    <DataTable
      columns={columns}
      data={licenses}
      variant="simple"
      pagination={false}
      getPath={getLicensePath}
      // Rows keep their component state -- an open confirmation, a pending
      // action -- with their version when a refetch reorders them.
      getRowId={(license) => license.id}
      linkColumnId="versionName"
    />
  );
};

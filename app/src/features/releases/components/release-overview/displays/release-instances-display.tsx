import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type ColumnDef, TableLinkedItemsDialog } from '@/functionals/table';
import type { ReleaseManagementOverviewInstance } from '../../../types';

type ReleaseInstancesDisplayProps = {
  deploymentZoneNameById: Map<string, string>;
  instances: ReleaseManagementOverviewInstance[];
};

export function ReleaseInstancesDisplay({
  deploymentZoneNameById,
  instances,
}: ReleaseInstancesDisplayProps) {
  const { t } = useTranslation();
  const columns = useMemo<ColumnDef<ReleaseManagementOverviewInstance>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('Pages.Releases.Releases.Dialogs.Columns.instance'),
        cell: ({ row }) => (
          <div className="space-y-1">
            <span className="font-medium">{row.original.name}</span>
            {row.original.description ? (
              <p className="text-sm text-muted-foreground">
                {row.original.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'customer',
        header: t('Pages.Releases.Releases.Dialogs.Columns.customer'),
        cell: ({ row }) => row.original.customer?.name ?? '-',
      },
      {
        id: 'deploymentZone',
        header: t('Pages.Releases.Releases.Dialogs.Columns.deploymentZone'),
        cell: ({ row }) =>
          row.original.deploymentZoneId
            ? (deploymentZoneNameById.get(row.original.deploymentZoneId) ?? '-')
            : '-',
      },
    ],
    [deploymentZoneNameById, t],
  );

  if (instances.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <TableLinkedItemsDialog
      columns={columns}
      data={instances}
      title={t('Pages.Releases.Releases.Dialogs.instancesTitle')}
      description={t('Pages.Releases.Releases.Dialogs.instancesDescription')}
      triggerLabel={t('Pages.Releases.Releases.Table.instanceCount', {
        count: instances.length,
      })}
    />
  );
}

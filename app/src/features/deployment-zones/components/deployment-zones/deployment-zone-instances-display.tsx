import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeploymentZoneRelatedInstance } from '@/domains/release-management';
import { type ColumnDef, TableLinkedItemsDialog } from '@/functionals/table';

export function DeploymentZoneInstancesDisplay({
  instances,
}: {
  instances: DeploymentZoneRelatedInstance[];
}) {
  const { t } = useTranslation();
  const columns = useMemo<ColumnDef<DeploymentZoneRelatedInstance>[]>(
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
        id: 'customerName',
        header: t('Pages.Releases.Releases.Dialogs.Columns.customer'),
        cell: ({ row }) => row.original.customerName ?? '-',
      },
    ],
    [t],
  );

  if (instances.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <TableLinkedItemsDialog
      columns={columns}
      data={instances}
      title={t('Pages.Releases.DeploymentZones.Dialogs.instancesTitle')}
      description={t(
        'Pages.Releases.DeploymentZones.Dialogs.instancesDescription',
      )}
      triggerLabel={t('Pages.Releases.DeploymentZones.Table.instanceCount', {
        count: instances.length,
      })}
    />
  );
}

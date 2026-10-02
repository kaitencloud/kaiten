import { Badge } from '@/components/ui/badge';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatZoneType,
  getZoneTypeBadgeVariant,
} from '@/domains/release-management';
import { type ColumnDef, TableLinkedItemsDialog } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';

const DeploymentZoneIcon = dataModelIcons.deploymentZone;

export type LinkedDeploymentZone = {
  description?: string | null;
  id: string;
  name: string;
  slug?: string | null;
  type: string;
};

export function ReleaseLinkedDeploymentZonesDisplay({
  deploymentZones,
  emptyLabel,
}: {
  deploymentZones: LinkedDeploymentZone[];
  emptyLabel?: string;
}) {
  const { t } = useTranslation();
  const columns = useMemo<ColumnDef<LinkedDeploymentZone>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('Features.Releases.Table.Columns.name'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <DeploymentZoneIcon className="size-4 text-primary-subtle-foreground" />
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: t('Features.Releases.Table.Columns.type'),
        cell: ({ row }) => (
          <Badge variant={getZoneTypeBadgeVariant(row.original.type)}>
            {formatZoneType(row.original.type, t)}
          </Badge>
        ),
      },
      {
        accessorKey: 'description',
        header: t('Features.Releases.Table.Columns.description'),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.description || '-'}
          </span>
        ),
      },
    ],
    [t],
  );

  if (deploymentZones.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        {emptyLabel ?? t('Features.Releases.Table.notDeployed')}
      </span>
    );
  }

  return (
    <TableLinkedItemsDialog
      columns={columns}
      data={deploymentZones}
      title={t('Features.Releases.Table.Columns.deploymentZones')}
      triggerLabel={t('Pages.Releases.Releases.Table.zoneCount', {
        count: deploymentZones.length,
      })}
    />
  );
}

import { Badge } from '@/components/ui/badge';
import { Tag } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatReleaseStatus,
  getReleaseOverviewStatus,
  getReleaseStatusBadgeVariant,
} from '@/domains/release-management';
import type {
  DeploymentZoneRelatedRelease,
  ReleaseManagementOverviewRelease,
} from '@/domains/release-management';
import { type ColumnDef, TableLinkedItemsDialog } from '@/functionals/table';
import { formatDate } from '../../utils/deployment-zone-helpers';

export function DeploymentZoneReleasesDisplay({
  releaseById,
  releases,
}: {
  releaseById: Map<string, ReleaseManagementOverviewRelease>;
  releases: DeploymentZoneRelatedRelease[];
}) {
  const { t } = useTranslation();
  const columns = useMemo<ColumnDef<DeploymentZoneRelatedRelease>[]>(
    () => [
      {
        accessorKey: 'version',
        header: t('Pages.Releases.Components.Dialog.Columns.release'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Tag className="size-4 text-primary-subtle-foreground" />
            <span className="font-medium">{row.original.version}</span>
          </div>
        ),
      },
      {
        id: 'status',
        header: t('Pages.Releases.Components.Dialog.Columns.status'),
        cell: ({ row }) => {
          const release = releaseById.get(row.original.id);

          if (!release) {
            return <span className="text-sm text-muted-foreground">-</span>;
          }

          const status = getReleaseOverviewStatus(release);
          return (
            <Badge variant={getReleaseStatusBadgeVariant(status)}>
              {formatReleaseStatus(status, t)}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: t('Pages.Releases.Components.Dialog.Columns.created'),
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
    ],
    [releaseById, t],
  );

  if (releases.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <TableLinkedItemsDialog
      columns={columns}
      data={releases}
      title={t('Pages.Releases.DeploymentZones.Dialogs.releasesTitle')}
      description={t(
        'Pages.Releases.DeploymentZones.Dialogs.releasesDescription',
      )}
      triggerLabel={t('Pages.Releases.DeploymentZones.Table.releaseCount', {
        count: releases.length,
      })}
    />
  );
}

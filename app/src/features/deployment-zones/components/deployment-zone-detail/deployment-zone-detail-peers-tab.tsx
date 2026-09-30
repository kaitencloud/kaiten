import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Link, useRouter } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeploymentZone } from '@/api-client';
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
  dataTableSortableHeader,
  TableActionButton,
  TableCard,
} from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import {
  formatDate,
  formatZoneType,
  getZoneTypeBadgeVariant,
} from '../../utils/deployment-zone-helpers';
import { useDeploymentZoneDetailContext } from './deployment-zone-detail-context';

export function DeploymentZoneDetailPeersTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const DeploymentZoneIcon = dataModelIcons.deploymentZone;
  const { currentRelease, peerZones } = useDeploymentZoneDetailContext();

  const columns = useMemo<ColumnDef<DeploymentZone>[]>(
    () => [
      {
        accessorKey: 'name',
        header: dataTableSortableHeader(
          t('Features.Releases.Table.Columns.name', 'Name'),
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <DeploymentZoneIcon className="size-4 text-primary-subtle-foreground" />
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: 'type',
        enableSorting: false,
        header: t('Features.Releases.Table.Columns.type', 'Type'),
        cell: ({ row }) => (
          <Badge variant={getZoneTypeBadgeVariant(row.original.type)}>
            {formatZoneType(row.original.type, t)}
          </Badge>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: dataTableSortableHeader(
          t('Features.Releases.Table.Columns.updatedAt', 'Updated'),
        ),
        cell: ({ row }) => (
          <span className="text-sm">{formatDate(row.original.updatedAt)}</span>
        ),
      },
      createActionsColumn<DeploymentZone>((deploymentZone) =>
        deploymentZone.slug ? (
          <TableActionButton
            tooltip={t(
              'Pages.Releases.DeploymentZones.Detail.links.openZone',
              'Open zone',
            )}
            asChild
          >
            <Link
              to="/releases/deployment-zones/$zoneSlug"
              params={{ zoneSlug: deploymentZone.slug }}
            >
              <ArrowRight className="size-4" />
            </Link>
          </TableActionButton>
        ) : null,
      ),
    ],
    [t, DeploymentZoneIcon],
  );

  const getZonePath = (deploymentZone: DeploymentZone) =>
    deploymentZone.slug
      ? router.buildLocation({
          to: '/releases/deployment-zones/$zoneSlug',
          params: { zoneSlug: deploymentZone.slug },
        }).pathname
      : undefined;

  if (!currentRelease) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {t(
              'Pages.Releases.DeploymentZones.Detail.Peers.notDeployedTitle',
              'No Peers',
            )}
          </CardTitle>
          <CardDescription>
            {t(
              'Pages.Releases.DeploymentZones.Detail.Peers.notDeployedDescription',
              'This zone has no linked release yet, so no peer zones can be computed.',
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <TableCard>
      <TableCard.Header>
        <TableCard.HeaderLeading>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle>
              {t(
                'Pages.Releases.DeploymentZones.Detail.Peers.title',
                'Peer Zones',
              )}
            </TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>
              {t(
                'Pages.Releases.DeploymentZones.Detail.Peers.description',
                'Other deployment zones currently sharing the same release.',
              )}
            </TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>
      </TableCard.Header>

      <TableCard.Content>
        <DataTable
          columns={columns}
          data={peerZones}
          getPath={getZonePath}
          pagination={false}
          emptyMessage={t(
            'Pages.Releases.DeploymentZones.Detail.Peers.empty',
            'No other deployment zones share this release.',
          )}
        />
      </TableCard.Content>
    </TableCard>
  );
}

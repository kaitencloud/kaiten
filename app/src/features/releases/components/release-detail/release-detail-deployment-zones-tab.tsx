import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@tanstack/react-router';
import { ArrowRight, Rocket, Server } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatZoneType,
  getZoneTypeBadgeVariant,
} from '@/domains/release-management';
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
  dataTableSortableHeader,
  TableActionButton,
  TableCard,
} from '@/functionals/table';
import { formatDate } from '@/lib/detail';
import type { ReleaseDetailLinkedDeploymentZone } from '../../utils';
import { useReleaseDetailContext } from './release-detail-context';

export function ReleaseDetailDeploymentZonesTab() {
  const { i18n, t } = useTranslation();
  const router = useRouter();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const { linkedDeploymentZones, releaseSlug } = useReleaseDetailContext();

  const columns = useMemo<ColumnDef<ReleaseDetailLinkedDeploymentZone>[]>(
    () => [
      {
        accessorKey: 'name',
        header: dataTableSortableHeader(
          t('Features.Releases.Table.Columns.name', 'Name'),
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Server className="size-4 text-primary-subtle-foreground" />
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
          <span className="text-sm">
            {formatDate(row.original.updatedAt, locale)}
          </span>
        ),
      },
      createActionsColumn<ReleaseDetailLinkedDeploymentZone>(
        (deploymentZone) =>
          deploymentZone.slug ? (
            <TableActionButton
              tooltip={t(
                'Pages.Releases.Detail.links.openDeploymentZone',
                'Open deployment zone',
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
    [locale, t],
  );

  const getZonePath = (deploymentZone: ReleaseDetailLinkedDeploymentZone) =>
    deploymentZone.slug
      ? router.buildLocation({
          to: '/releases/deployment-zones/$zoneSlug',
          params: { zoneSlug: deploymentZone.slug },
        }).pathname
      : undefined;

  return (
    <TableCard>
      <TableCard.Header>
        <TableCard.HeaderLeading>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle>
              {t(
                'Pages.Releases.Detail.DeploymentZones.title',
                'Linked Deployment Zones',
              )}
            </TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>
              {t(
                'Pages.Releases.Detail.DeploymentZones.description',
                'Zones currently linked to this release through active deployment.',
              )}
            </TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>
      </TableCard.Header>

      <TableCard.Content>
        {linkedDeploymentZones.length === 0 ? (
          // A dead end said "no zones" and offered nothing: deploying happens
          // from here as well now.
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Rocket
              className="size-6 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t(
                  'Pages.Releases.Detail.DeploymentZones.emptyTitle',
                  'Not deployed anywhere yet',
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {t(
                  'Pages.Releases.Detail.DeploymentZones.emptyDescription',
                  'Pick a deployment zone to run this release.',
                )}
              </p>
            </div>
            <Button asChild>
              <Link to="/releases/$releaseSlug/deploy" params={{ releaseSlug }}>
                <Rocket className="size-4" />
                {t(
                  'Pages.Releases.Detail.DeploymentZones.emptyCta',
                  'Deploy to a zone',
                )}
              </Link>
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={linkedDeploymentZones}
            getPath={getZonePath}
            pagination={false}
          />
        )}
      </TableCard.Content>
    </TableCard>
  );
}

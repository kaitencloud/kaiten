import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Boxes, GitBranch, Rocket } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeploymentZone } from '@/api-client';
import { DestructiveActionButton } from '@/components/destructive-action-button';
import { DetailEntityLayout } from '@/functionals/detail-entity-layout';
import { Page } from '@/functionals/page';
import { StatBadgeValue, StatsCardsRow } from '@/functionals/stats-cards-row';
import { dataModelIcons } from '@/lib/data-model-icons';
import { getActiveTabFromPathname } from '@/lib/detail';
import { useDeleteDeploymentZoneMutation } from '../../hooks';
import {
  formatZoneType,
  getZoneTypeBadgeVariant,
} from '../../utils/deployment-zone-helpers';
import {
  DeploymentZoneDetailProvider,
  useDeploymentZoneDetailContext,
} from './deployment-zone-detail-context';

type DeploymentZoneDetailPageContentProps = PropsWithChildren<{
  deploymentZone: DeploymentZone;
  zoneSlug: string;
}>;

function DeploymentZoneDetailLayout({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const DeploymentZoneIcon = dataModelIcons.deploymentZone;
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activeTab = getActiveTabFromPathname({
    defaultTab: 'overview',
    matchers: [{ suffix: '/peers', value: 'peers' }],
    pathname,
  });
  const {
    currentRelease,
    deploymentZone,
    metadataKeysCount,
    isDeployed,
    sameReleaseZonesCount,
    zoneSlug,
  } = useDeploymentZoneDetailContext();
  const deleteMutation = useDeleteDeploymentZoneMutation(deploymentZone);

  return (
    <DetailEntityLayout
      activeTab={activeTab}
      header={
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <DeploymentZoneIcon className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.TitleRow>
                <Page.Title>{deploymentZone.name}</Page.Title>
                <Badge variant={getZoneTypeBadgeVariant(deploymentZone.type)}>
                  {formatZoneType(deploymentZone.type, t)}
                </Badge>
                <Badge variant={isDeployed ? 'success' : 'secondary'}>
                  {isDeployed
                    ? t(
                        'Pages.Releases.DeploymentZones.Detail.status.deployed',
                        'Deployed',
                      )
                    : t(
                        'Pages.Releases.DeploymentZones.Detail.status.notDeployed',
                        'Not deployed',
                      )}
                </Badge>
              </Page.TitleRow>
              <Page.Subtitle>
                {deploymentZone.description ||
                  t(
                    'Pages.Releases.DeploymentZones.Detail.fallback.noDescription',
                    'No description provided.',
                  )}
              </Page.Subtitle>
            </Page.Heading>
          </Page.Leading>

          <Page.Actions>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="gap-2" asChild>
                <Link
                  to="/releases/deployment-zones/$zoneSlug/edit"
                  params={{ zoneSlug }}
                >
                  <GitBranch className="size-4" />
                  {t('Features.Releases.Actions.edit')}
                </Link>
              </Button>
              {/* The page's main action: solid, like Deploy on the instance page. */}
              <Button className="gap-2" asChild>
                <Link
                  to="/releases/deployment-zones/$zoneSlug/deploy"
                  params={{ zoneSlug }}
                >
                  <Rocket className="size-4" />
                  {t('Features.Releases.Actions.deploy')}
                </Link>
              </Button>
              <DestructiveActionButton
                label={t('Common.delete')}
                title={t('Common.confirmDeleteTitle')}
                description={t('Common.confirmDeleteDescription', {
                  name: deploymentZone.name,
                })}
                cancelLabel={t('Common.cancel')}
                confirmLabel={t('Common.confirm')}
                onConfirm={async () => {
                  await deleteMutation.mutateAsync({
                    path: { deploymentZoneSlug: zoneSlug },
                  });
                  navigate({ to: '/releases/deployment-zones' });
                }}
                disabled={deleteMutation.isPending}
              />
            </div>
          </Page.Actions>
        </Page.Header>
      }
      stats={
        <StatsCardsRow
          className="gap-4 lg:gap-6"
          columnsClassName="md:grid-cols-2 xl:grid-cols-4"
          items={[
            {
              id: 'zone-type',
              label: t(
                'Pages.Releases.DeploymentZones.Detail.stats.type',
                'Type',
              ),
              value: (
                <StatBadgeValue>
                  {formatZoneType(deploymentZone.type, t)}
                </StatBadgeValue>
              ),
              Icon: DeploymentZoneIcon,
            },
            {
              id: 'zone-current-release',
              label: t(
                'Pages.Releases.DeploymentZones.Detail.stats.currentRelease',
                'Current release',
              ),
              value: currentRelease?.version ?? (
                <StatBadgeValue variant="secondary">
                  {t('Features.Releases.Table.notDeployed')}
                </StatBadgeValue>
              ),
              Icon: Rocket,
            },
            {
              id: 'zone-metadata-keys',
              label: t(
                'Pages.Releases.DeploymentZones.Detail.stats.metadataKeys',
                'Metadata keys',
              ),
              value: String(metadataKeysCount),
              Icon: Boxes,
            },
            {
              id: 'zone-shared-release',
              label: t(
                'Pages.Releases.DeploymentZones.Detail.stats.sharedReleaseZones',
                'Zones sharing current release',
              ),
              value: String(sameReleaseZonesCount),
              Icon: GitBranch,
            },
          ]}
        />
      }
      tabs={[
        {
          label: t(
            'Pages.Releases.DeploymentZones.Detail.tabs.overview',
            'Overview',
          ),
          params: { zoneSlug },
          to: '/releases/deployment-zones/$zoneSlug',
          value: 'overview',
        },
        {
          label: t('Pages.Releases.DeploymentZones.Detail.tabs.peers', 'Peers'),
          params: { zoneSlug },
          to: '/releases/deployment-zones/$zoneSlug/peers',
          value: 'peers',
        },
      ]}
    >
      {children}
    </DetailEntityLayout>
  );
}

export function DeploymentZoneDetailPageContent({
  children,
  deploymentZone,
  zoneSlug,
}: DeploymentZoneDetailPageContentProps) {
  return (
    <DeploymentZoneDetailProvider
      deploymentZone={deploymentZone}
      zoneSlug={zoneSlug}
    >
      <DeploymentZoneDetailLayout>{children}</DeploymentZoneDetailLayout>
    </DeploymentZoneDetailProvider>
  );
}

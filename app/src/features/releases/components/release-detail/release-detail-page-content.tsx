import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { CalendarClock, Rocket, Server } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import type { Release } from '@/api-client';
import { DestructiveActionButton } from '@/components/destructive-action-button';
import {
  formatReleaseStatus,
  getReleaseStatusBadgeVariant,
} from '@/domains/release-management';
import { DetailEntityLayout } from '@/functionals/detail-entity-layout';
import { Page } from '@/functionals/page';
import { StatsCardsRow } from '@/functionals/stats-cards-row';
import { formatDetailDateTime, getActiveTabFromPathname } from '@/lib/detail';
import { useDeleteReleaseMutation } from '../../hooks';
import {
  ReleaseDetailProvider,
  useReleaseDetailContext,
} from './release-detail-context';

type ReleaseDetailPageContentProps = PropsWithChildren<{
  release: Release;
  releaseSlug: string;
}>;

function ReleaseDetailLayout({ children }: PropsWithChildren) {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activeTab = getActiveTabFromPathname({
    defaultTab: 'overview',
    matchers: [{ suffix: '/deployment-zones', value: 'deployment-zones' }],
    pathname,
  });
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const {
    lastDeploymentAt,
    linkedDeploymentZones,
    productionZonesCount,
    release,
    releaseSlug,
    status,
  } = useReleaseDetailContext();
  const deleteMutation = useDeleteReleaseMutation(release);

  return (
    <DetailEntityLayout
      activeTab={activeTab}
      header={
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <Rocket className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.TitleRow>
                <Page.Title>{release.version}</Page.Title>
                <Badge variant={getReleaseStatusBadgeVariant(status)}>
                  {formatReleaseStatus(status, t)}
                </Badge>
              </Page.TitleRow>
              <Page.Subtitle>
                {release.description ??
                  t(
                    'Pages.Releases.Detail.fallback.noDescription',
                    'No description provided.',
                  )}
              </Page.Subtitle>
            </Page.Heading>
          </Page.Leading>

          <Page.Actions>
            <div className="flex items-center gap-2">
              {/* The page's main action: solid, like Deploy on the instance page. */}
              <Button className="gap-2" asChild>
                <Link
                  to="/releases/$releaseSlug/deploy"
                  params={{ releaseSlug }}
                >
                  <Rocket className="size-4" />
                  {t('Pages.Releases.Detail.actions.deploy', 'Deploy')}
                </Link>
              </Button>
              <DestructiveActionButton
                label={t('Common.delete')}
                title={t('Common.confirmDeleteTitle')}
                description={t('Common.confirmDeleteDescription', {
                  name: release.version,
                })}
                cancelLabel={t('Common.cancel')}
                confirmLabel={t('Common.confirm')}
                onConfirm={async () => {
                  await deleteMutation.mutateAsync({
                    path: { releaseSlug },
                  });
                  navigate({ to: '/releases/deployments' });
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
          // The status already sits beside the title as a badge.
          columnsClassName="md:grid-cols-3"
          items={[
            {
              id: 'release-zones',
              label: t(
                'Pages.Releases.Detail.stats.deploymentZones',
                'Deployment zones',
              ),
              value: String(linkedDeploymentZones.length),
              Icon: Server,
            },
            {
              id: 'release-production-zones',
              label: t(
                'Pages.Releases.Detail.stats.productionZones',
                'Production zones',
              ),
              value: String(productionZonesCount),
              Icon: Rocket,
              iconClassName: 'text-destructive-subtle-foreground',
            },
            {
              id: 'release-last-deployment',
              label: t(
                'Pages.Releases.Detail.stats.lastDeployment',
                'Last deployment update',
              ),
              value: lastDeploymentAt
                ? formatDetailDateTime(lastDeploymentAt, locale)
                : t('Pages.Releases.Detail.stats.never', 'Never'),
              Icon: CalendarClock,
            },
          ]}
        />
      }
      tabs={[
        {
          label: t('Pages.Releases.Detail.tabs.overview', 'Overview'),
          params: { releaseSlug },
          to: '/releases/$releaseSlug',
          value: 'overview',
        },
        {
          label: t(
            'Pages.Releases.Detail.tabs.deploymentZones',
            'Deployment Zones',
          ),
          params: { releaseSlug },
          to: '/releases/$releaseSlug/deployment-zones',
          value: 'deployment-zones',
        },
      ]}
    >
      {children}
    </DetailEntityLayout>
  );
}

export function ReleaseDetailPageContent({
  children,
  release,
  releaseSlug,
}: ReleaseDetailPageContentProps) {
  return (
    <ReleaseDetailProvider release={release} releaseSlug={releaseSlug}>
      <ReleaseDetailLayout>{children}</ReleaseDetailLayout>
    </ReleaseDetailProvider>
  );
}

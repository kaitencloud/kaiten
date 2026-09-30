import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  formatReleaseStatus,
  formatZoneType,
  getReleaseStatusBadgeVariant,
  getZoneTypeBadgeVariant,
} from '@/domains/release-management';
import { DetailCard } from '@/functionals/detail-card';
import { formatDetailDateTime, getAuditDisplayName } from '@/lib/detail';
import { ReleaseComponentsCard } from './release-detail-components-card';
import { useReleaseDetailContext } from './release-detail-context';
import type { ZoneTypeCount } from '../../utils';

type ReleaseDetailTranslation = ReturnType<typeof useTranslation>['t'];
type LinkedDeploymentZones = ReturnType<
  typeof useReleaseDetailContext
>['linkedDeploymentZones'];

type ReleaseGeneralInformationCardProps = {
  createdByName: string;
  locale: string;
  release: ReturnType<typeof useReleaseDetailContext>['release'];
  status: ReturnType<typeof useReleaseDetailContext>['status'];
  t: ReleaseDetailTranslation;
};

function ReleaseGeneralInformationCard({
  createdByName,
  locale,
  release,
  status,
  t,
}: ReleaseGeneralInformationCardProps) {
  return (
    <DetailCard className="lg:col-span-2">
      <DetailCard.Header>
        <DetailCard.Title>
          {t(
            'Pages.Releases.Detail.Overview.general.title',
            'General Information',
          )}
        </DetailCard.Title>
        <DetailCard.Description>
          {t(
            'Pages.Releases.Detail.Overview.general.description',
            'Core release metadata and immutable audit information.',
          )}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          <DetailCard.Row
            label={t(
              'Pages.Releases.Detail.Overview.general.fields.version',
              'Version',
            )}
            value={release.version}
          />
          <DetailCard.Row
            label={t(
              'Pages.Releases.Detail.Overview.general.fields.slug',
              'Slug',
            )}
            value={
              <code className="inline-flex rounded bg-muted px-2 py-1 font-mono text-xs">
                {release.slug ?? '—'}
              </code>
            }
          />
          <DetailCard.Row
            label={t('Pages.Releases.Detail.Overview.general.fields.id', 'ID')}
            value={
              <code className="inline-flex rounded bg-muted px-2 py-1 font-mono text-xs">
                {release.id}
              </code>
            }
          />
          <DetailCard.Row
            label={t(
              'Pages.Releases.Detail.Overview.general.fields.status',
              'Status',
            )}
            value={
              <Badge variant={getReleaseStatusBadgeVariant(status)}>
                {formatReleaseStatus(status, t)}
              </Badge>
            }
          />
          <DetailCard.Row
            align="start"
            label={t(
              'Pages.Releases.Detail.Overview.general.fields.description',
              'Description',
            )}
            value={
              release.description ??
              t(
                'Pages.Releases.Detail.fallback.noDescription',
                'No description provided.',
              )
            }
            valueClassName="max-w-xl font-normal text-muted-foreground"
          />
        </DetailCard.Rows>

        <DetailCard.Divider />

        {/* A release is immutable, so there is no "updated at" to show: the
            API stopped publishing updatedAt/updatedBy, which only ever
            repeated the creation stamp. */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {t(
              'Pages.Releases.Detail.Overview.general.audit.createdAt',
              'Created at',
            )}
          </p>
          <p className="text-sm">
            {formatDetailDateTime(release.createdAt, locale)}
          </p>
          {createdByName ? (
            <p className="text-xs text-muted-foreground">
              {t('Pages.Releases.Detail.Overview.general.audit.by', 'by')}{' '}
              {createdByName}
            </p>
          ) : null}
        </div>
      </DetailCard.Content>
    </DetailCard>
  );
}

type ReleaseDeploymentFootprintCardProps = {
  linkedDeploymentZones: LinkedDeploymentZones;
  t: ReleaseDetailTranslation;
  zoneTypeCounts: ZoneTypeCount[];
};

function ReleaseDeploymentFootprintCard({
  linkedDeploymentZones,
  t,
  zoneTypeCounts,
}: ReleaseDeploymentFootprintCardProps) {
  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t(
            'Pages.Releases.Detail.Overview.deployment.title',
            'Deployment Footprint',
          )}
        </DetailCard.Title>
        <DetailCard.Description>
          {t(
            'Pages.Releases.Detail.Overview.deployment.description',
            'Deployment coverage by zone type and relation shortcuts.',
          )}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          <DetailCard.Row
            label={t(
              'Pages.Releases.Detail.Overview.deployment.fields.totalZones',
              'Linked zones',
            )}
            value={linkedDeploymentZones.length}
          />
          {/* One row per type the zones carry: a type is free-form, so a
              fixed production/staging/development split would drop an
              organization's own types -- or count them as the wrong one. */}
          {zoneTypeCounts.map(({ count, type }) => (
            <DetailCard.Row
              key={type}
              label={formatZoneType(type, t)}
              value={count}
            />
          ))}
        </DetailCard.Rows>

        <DetailCard.Divider />

        <div className="space-y-2">
          {linkedDeploymentZones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(
                'Pages.Releases.Detail.Overview.deployment.empty',
                'No deployment zones are linked to this release yet.',
              )}
            </p>
          ) : (
            linkedDeploymentZones.slice(0, 5).map((deploymentZone) => (
              <div
                key={deploymentZone.id}
                className="flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {deploymentZone.name}
                  </p>
                  <Badge
                    variant={getZoneTypeBadgeVariant(deploymentZone.type)}
                    className="mt-1"
                  >
                    {formatZoneType(deploymentZone.type, t)}
                  </Badge>
                </div>
                {deploymentZone.slug ? (
                  <Button variant="ghost" size="icon" asChild>
                    <Link
                      to="/releases/deployment-zones/$zoneSlug"
                      params={{ zoneSlug: deploymentZone.slug }}
                    >
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </DetailCard.Content>
    </DetailCard>
  );
}

export function ReleaseDetailOverviewTab() {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const { linkedDeploymentZones, release, status, zoneTypeCounts } =
    useReleaseDetailContext();

  const createdByName = getAuditDisplayName({ actor: release.createdBy });

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <ReleaseGeneralInformationCard
        createdByName={createdByName}
        locale={locale}
        release={release}
        status={status}
        t={t}
      />
      <ReleaseDeploymentFootprintCard
        linkedDeploymentZones={linkedDeploymentZones}
        t={t}
        zoneTypeCounts={zoneTypeCounts}
      />
      <ReleaseComponentsCard components={release.components ?? []} />
    </div>
  );
}

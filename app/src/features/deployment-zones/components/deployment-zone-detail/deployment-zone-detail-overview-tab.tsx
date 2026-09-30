import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DetailCard } from '@/functionals/detail-card';
import { formatDetailDateTime, getAuditDisplayName } from '@/lib/detail';
import { cn } from '@/lib/utils';
import {
  formatZoneType,
  getZoneTypeBadgeVariant,
} from '../../utils/deployment-zone-helpers';
import { useDeploymentZoneDetailContext } from './deployment-zone-detail-context';

function DeploymentZoneDetailLink({
  children,
  releaseSlug,
}: {
  children: string;
  releaseSlug: string;
}) {
  return (
    <Link
      to="/releases/$releaseSlug"
      params={{ releaseSlug }}
      className={cn(
        buttonVariants({ size: 'sm', variant: 'link' }),
        'h-auto gap-1 px-0 font-medium',
      )}
    >
      <span>{children}</span>
      <ExternalLink className="size-3.5" />
    </Link>
  );
}

export function DeploymentZoneDetailOverviewTab() {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const { currentRelease, deploymentZone } = useDeploymentZoneDetailContext();

  const createdByName = getAuditDisplayName({
    actor: deploymentZone.createdBy,
  });
  const updatedByName = getAuditDisplayName({
    actor: deploymentZone.updatedBy,
  });

  const features = deploymentZone.metadata ?? {};
  const hasFeatures = Object.keys(features).length > 0;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <DetailCard className="lg:col-span-2">
        <DetailCard.Header>
          <DetailCard.Title>
            {t(
              'Pages.Releases.DeploymentZones.Detail.Overview.general.title',
              'General Information',
            )}
          </DetailCard.Title>
          <DetailCard.Description>
            {t(
              'Pages.Releases.DeploymentZones.Detail.Overview.general.description',
              'Deployment zone identity and immutable audit trail.',
            )}
          </DetailCard.Description>
        </DetailCard.Header>
        <DetailCard.Content>
          <DetailCard.Rows>
            <DetailCard.Row
              label={t('Features.Releases.Table.Columns.name', 'Name')}
              value={deploymentZone.name}
            />
            <DetailCard.Row
              label={t('Features.Releases.Table.Columns.type', 'Type')}
              value={
                <Badge variant={getZoneTypeBadgeVariant(deploymentZone.type)}>
                  {formatZoneType(deploymentZone.type, t)}
                </Badge>
              }
            />
            <DetailCard.Row
              label={t(
                'Pages.Releases.DeploymentZones.Detail.Overview.general.fields.slug',
                'Slug',
              )}
              value={
                <code className="inline-flex rounded bg-muted px-2 py-1 font-mono text-xs">
                  {deploymentZone.slug ?? '—'}
                </code>
              }
            />
            <DetailCard.Row
              label={t(
                'Pages.Releases.DeploymentZones.Detail.Overview.general.fields.id',
                'ID',
              )}
              value={
                <code className="inline-flex rounded bg-muted px-2 py-1 font-mono text-xs">
                  {deploymentZone.id}
                </code>
              }
            />
            <DetailCard.Row
              align="start"
              label={t(
                'Features.Releases.Table.Columns.description',
                'Description',
              )}
              value={
                deploymentZone.description ||
                t(
                  'Pages.Releases.DeploymentZones.Detail.fallback.noDescription',
                  'No description provided.',
                )
              }
              valueClassName="max-w-xl font-normal text-muted-foreground"
            />
          </DetailCard.Rows>

          <DetailCard.Divider />

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t(
                  'Pages.Releases.DeploymentZones.Detail.Overview.general.audit.createdAt',
                  'Created at',
                )}
              </p>
              <p className="text-sm">
                {formatDetailDateTime(deploymentZone.createdAt, locale)}
              </p>
              {createdByName ? (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'Pages.Releases.DeploymentZones.Detail.Overview.general.audit.by',
                    'by',
                  )}{' '}
                  {createdByName}
                </p>
              ) : null}
            </div>
            <div className="space-y-1 text-right">
              <p className="text-xs text-muted-foreground">
                {t(
                  'Pages.Releases.DeploymentZones.Detail.Overview.general.audit.updatedAt',
                  'Updated at',
                )}
              </p>
              <p className="text-sm">
                {formatDetailDateTime(deploymentZone.updatedAt, locale)}
              </p>
              {updatedByName ? (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'Pages.Releases.DeploymentZones.Detail.Overview.general.audit.by',
                    'by',
                  )}{' '}
                  {updatedByName}
                </p>
              ) : null}
            </div>
          </div>
        </DetailCard.Content>
      </DetailCard>

      <DetailCard>
        <DetailCard.Header>
          <DetailCard.Title>
            {t(
              'Pages.Releases.DeploymentZones.Detail.Overview.release.title',
              'Current Release',
            )}
          </DetailCard.Title>
          <DetailCard.Description>
            {t(
              'Pages.Releases.DeploymentZones.Detail.Overview.release.description',
              'Release currently associated with this deployment zone.',
            )}
          </DetailCard.Description>
        </DetailCard.Header>
        <DetailCard.Content>
          {currentRelease ? (
            <DetailCard.Rows>
              <DetailCard.Row
                label={t('Features.Releases.Table.Columns.release', 'Release')}
                value={
                  currentRelease.slug ? (
                    <DeploymentZoneDetailLink releaseSlug={currentRelease.slug}>
                      {currentRelease.version}
                    </DeploymentZoneDetailLink>
                  ) : (
                    currentRelease.version
                  )
                }
              />
            </DetailCard.Rows>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('Features.Releases.Table.notDeployed')}
            </p>
          )}

          <DetailCard.Divider />

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t(
                'Pages.Releases.DeploymentZones.Detail.Overview.features.title',
                'Features metadata',
              )}
            </p>
            {hasFeatures ? (
              <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(features, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  'Pages.Releases.DeploymentZones.Detail.Overview.features.empty',
                  'No features metadata configured for this zone.',
                )}
              </p>
            )}
          </div>
        </DetailCard.Content>
      </DetailCard>
    </div>
  );
}

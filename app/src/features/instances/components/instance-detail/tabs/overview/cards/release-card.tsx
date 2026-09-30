import { Badge } from '@/components/ui/badge';
import { Rocket } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatReleaseStatus,
  getReleaseStatusBadgeVariant,
  type ReleaseStatus,
} from '@/domains/release-management';
import { DetailCard } from '@/functionals/detail-card';
import { formatDateTime } from '../../../../../utils/instance-detail-overview.utils';
import { InstanceRelatedLink } from './instance-related-link';

type InstanceReleaseCardProps = {
  /**
   * Deploy / migrate control. Sits next to the card title on a deployed
   * instance, and inside the empty state on an orphan one, where deploying is
   * the only thing the card has to offer.
   */
  action?: ReactNode;
  deployedAt: string | null;
  deployedByName: string;
  deploymentZone: string;
  /**
   * Whether the instance is attached to a deployment zone. Read from the
   * instance itself, not from the resolved release: a zone with no release
   * deployed on it is still a deployment.
   */
  isDeployed: boolean;
  releaseSlug: string | null;
  /** Null when the release cannot be resolved. */
  releaseStatus: ReleaseStatus | null;
  releaseVersion: string;
  zoneSlug: string | null;
};

export const InstanceReleaseCard = ({
  action,
  deployedAt,
  deployedByName,
  deploymentZone,
  isDeployed,
  releaseSlug,
  releaseStatus,
  releaseVersion,
  zoneSlug,
}: InstanceReleaseCardProps) => {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';

  return (
    <DetailCard>
      <DetailCard.Header>
        <div>
          <DetailCard.Title className="text-base flex items-center gap-2">
            <Rocket className="size-4 text-primary-subtle-foreground" />
            {t('Pages.Customers.Instances.Detail.release.title')}
          </DetailCard.Title>
          <DetailCard.Description>
            {t('Pages.Customers.Instances.Detail.release.description')}
          </DetailCard.Description>
        </div>
        {isDeployed && action ? (
          <DetailCard.Action>{action}</DetailCard.Action>
        ) : null}
      </DetailCard.Header>
      <DetailCard.Content>
        {isDeployed ? (
          <DeployedRelease
            deployedAt={deployedAt}
            deployedByName={deployedByName}
            deploymentZone={deploymentZone}
            locale={locale}
            releaseSlug={releaseSlug}
            releaseStatus={releaseStatus}
            releaseVersion={releaseVersion}
            zoneSlug={zoneSlug}
          />
        ) : (
          // Nothing to report on an orphan instance: every row would read
          // "Unknown". Offer the one action that changes that instead.
          <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed p-6 text-center">
            <Rocket className="size-6 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t('Pages.Customers.Instances.Detail.release.empty.title')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  'Pages.Customers.Instances.Detail.release.empty.description',
                )}
              </p>
            </div>
            {action}
          </div>
        )}
      </DetailCard.Content>
    </DetailCard>
  );
};

type DeployedReleaseProps = Omit<
  InstanceReleaseCardProps,
  'action' | 'isDeployed'
> & { locale: string };

const DeployedRelease = ({
  deployedAt,
  deployedByName,
  deploymentZone,
  locale,
  releaseSlug,
  releaseStatus,
  releaseVersion,
  zoneSlug,
}: DeployedReleaseProps) => {
  const { t } = useTranslation();

  return (
    <>
      <DetailCard.Rows>
        <DetailCard.Row
          label={t('Pages.Customers.Instances.Detail.release.version')}
          value={
            releaseSlug ? (
              <InstanceRelatedLink
                to="/releases/$releaseSlug"
                params={{ releaseSlug }}
                className="text-sm"
              >
                {releaseVersion}
              </InstanceRelatedLink>
            ) : (
              releaseVersion
            )
          }
        />
        <DetailCard.Row
          label={t('Pages.Customers.Instances.Detail.release.status')}
          value={
            releaseStatus ? (
              <Badge variant={getReleaseStatusBadgeVariant(releaseStatus)}>
                {formatReleaseStatus(releaseStatus, t)}
              </Badge>
            ) : (
              <Badge variant="outline">
                {t('Pages.Customers.Instances.Detail.quickStats.unknown')}
              </Badge>
            )
          }
        />
        <DetailCard.Row
          label={t('Pages.Customers.Instances.Detail.release.deploymentZone')}
          value={
            zoneSlug ? (
              <InstanceRelatedLink
                to="/releases/deployment-zones/$zoneSlug"
                params={{ zoneSlug }}
                className="text-sm"
              >
                {deploymentZone}
              </InstanceRelatedLink>
            ) : (
              deploymentZone
            )
          }
        />
      </DetailCard.Rows>

      <DetailCard.Divider />

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {t('Pages.Customers.Instances.Detail.release.deployedAt')}
        </p>
        <p className="text-sm">
          {deployedAt ? formatDateTime(deployedAt, locale) : '-'}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('Pages.Customers.Instances.Detail.audit.by')} {deployedByName}
        </p>
      </div>
    </>
  );
};

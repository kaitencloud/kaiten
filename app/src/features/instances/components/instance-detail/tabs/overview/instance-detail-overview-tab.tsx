import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AttioSyncCard } from '@/domains/crm-sync';
import { metadataFieldsActiveQueryOptions } from '@/domains/metadata-fields';
import type { MetadataFieldDescriptor } from '@/functionals/metadata-fields';
import { isInstanceDeployed } from '../../../../utils/instance-deployment.utils';
import { formatDateTime } from '../../../../utils/instance-detail-overview.utils';
import { InstanceDeploymentButton } from '../../../instance-deployment';
import { useInstanceDetail } from '../../instance-detail-context';
import { InstanceInfoCard } from './cards';
import { InstanceLicenseCard } from './cards/license-card';
import { InstanceMetadataCard } from './cards/metadata-card';
import { InstanceReleaseCard } from './cards/release-card';

export const InstanceDetailOverviewTab = () => {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const {
    instance,
    customer,
    license,
    releaseVersion,
    releaseStatus,
    releaseSlug,
    deploymentZone,
    zoneSlug,
    deployedAt,
    deployedByName,
    createdByName,
    updatedByName,
    licenseProgress,
  } = useInstanceDetail();

  // Read from the instance, not from the resolved release chain: a zone with
  // no release deployed on it is still a deployment.
  const isDeployed = isInstanceDeployed(instance.deploymentZoneId);

  // Soft-fetch, as on the instances table: a missing or 403'd response is read
  // as "no schema declared" so the card degrades to its empty state instead of
  // taking the whole overview down.
  const { data: metadataFieldsData } = useQuery(
    metadataFieldsActiveQueryOptions('INSTANCE'),
  );
  const metadataFields = useMemo<MetadataFieldDescriptor[]>(
    () => metadataFieldsData ?? [],
    [metadataFieldsData],
  );

  // Three columns that each stack their cards, so a short card sits under a
  // neighbour instead of alone on a second row, and none is stretched. The
  // CRM card only renders when the connector is on, so the columns stay about
  // as tall with or without it.
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6 xl:grid-cols-3">
      <div className="grid gap-4 lg:gap-6">
        <InstanceInfoCard
          instance={instance}
          customerName={customer?.name}
          createdByName={createdByName}
          updatedByName={updatedByName}
          formatDateTime={(value) => formatDateTime(value, locale)}
        />

        <AttioSyncCard
          entityKind="instance"
          entitySlug={instance.slug}
          integrations={instance.integrations}
          domain={customer?.domain}
        />
      </div>

      <div className="grid gap-4 lg:gap-6">
        <InstanceLicenseCard
          instance={instance}
          license={license}
          licenseProgress={licenseProgress}
          licenseSlug={instance.licenseSlug}
        />

        <InstanceMetadataCard
          metadataFields={metadataFields}
          metadata={instance.metadata}
        />
      </div>

      <InstanceReleaseCard
        action={
          <InstanceDeploymentButton
            deploymentZoneId={instance.deploymentZoneId}
            instanceName={instance.name}
            instanceSlug={instance.slug!}
            // The empty state has nothing else to offer, so the deploy button
            // carries it; on a deployed card it stays a discreet header action.
            size={isDeployed ? 'sm' : 'default'}
            variant={isDeployed ? 'outline' : 'default'}
          />
        }
        isDeployed={isDeployed}
        releaseVersion={releaseVersion}
        releaseSlug={releaseSlug}
        releaseStatus={releaseStatus}
        deploymentZone={deploymentZone}
        zoneSlug={zoneSlug}
        deployedAt={deployedAt}
        deployedByName={deployedByName}
      />
    </div>
  );
};

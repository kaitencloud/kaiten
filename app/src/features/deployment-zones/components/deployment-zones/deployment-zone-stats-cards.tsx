import { useTranslation } from 'react-i18next';
import type { DeploymentZone } from '@/api-client';
import { countsAsProduction } from '@/domains/release-management';
import { StatCard } from '@/functionals/stat-card';
import { dataModelIcons } from '@/lib/data-model-icons';

export function DeploymentZoneStatsCards({
  deploymentZones,
  totalDeployments,
  totalInstances,
}: {
  deploymentZones: DeploymentZone[];
  totalDeployments: number;
  totalInstances: number;
}) {
  const { t } = useTranslation();
  const DeploymentZoneIcon = dataModelIcons.deploymentZone;
  const InstanceIcon = dataModelIcons.instance;
  const ReleaseIcon = dataModelIcons.release;

  // An organization's own types (`shared`, `dedicated`) count as production,
  // by the same rule as a release's Deployed status.
  const productionZones = deploymentZones.filter((z) =>
    countsAsProduction(z.type),
  ).length;

  return (
    <StatCard.Row>
      <StatCard>
        <StatCard.Label>
          {t('Features.Releases.Stats.totalZones')}
        </StatCard.Label>
        <StatCard.Icon>
          <DeploymentZoneIcon />
        </StatCard.Icon>
        <StatCard.Value>{deploymentZones.length}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Features.Releases.Stats.productionZones')}
        </StatCard.Label>
        <StatCard.Icon>
          <DeploymentZoneIcon />
        </StatCard.Icon>
        <StatCard.Value>{productionZones}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Features.Releases.Stats.totalInstances')}
        </StatCard.Label>
        <StatCard.Icon>
          <InstanceIcon />
        </StatCard.Icon>
        <StatCard.Value>{totalInstances}</StatCard.Value>
      </StatCard>
      <StatCard>
        <StatCard.Label>
          {t('Features.Releases.Stats.totalDeployments')}
        </StatCard.Label>
        <StatCard.Icon>
          <ReleaseIcon />
        </StatCard.Icon>
        <StatCard.Value>{totalDeployments}</StatCard.Value>
      </StatCard>
    </StatCard.Row>
  );
}

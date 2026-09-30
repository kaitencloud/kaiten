import { CheckCircle, Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DeploymentZone } from '@/api-client';
import { countsAsProduction } from '@/domains/release-management';
import { StatsCardsRow } from '@/functionals/stats-cards-row';
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

  // An organization's own types (`shared`, `dedicated`) count as production,
  // by the same rule as a release's Deployed status.
  const productionZones = deploymentZones.filter((z) =>
    countsAsProduction(z.type),
  ).length;

  return (
    <StatsCardsRow
      items={[
        {
          id: 'total-zones',
          label: t('Features.Releases.Stats.totalZones'),
          value: deploymentZones.length,
          Icon: DeploymentZoneIcon,
        },
        {
          id: 'production-zones',
          label: t('Features.Releases.Stats.productionZones'),
          value: productionZones,
          Icon: DeploymentZoneIcon,
        },
        {
          id: 'total-instances',
          label: t('Features.Releases.Stats.totalInstances'),
          value: totalInstances,
          Icon: CheckCircle,
        },
        {
          id: 'total-deployments',
          label: t('Features.Releases.Stats.totalDeployments'),
          value: totalDeployments,
          Icon: Rocket,
        },
      ]}
    />
  );
}

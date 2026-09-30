import type { DeploymentZone } from '@/api-client';
import {
  countsAsProduction,
  sortZoneTypes,
} from '@/domains/release-management';

export type ZoneTypeCount = { count: number; type: string };

type ReleaseDeploymentZoneCounts = {
  // The zones that count as production, by the same rule as the release status.
  productionZonesCount: number;
  // One entry per type the release's zones carry -- an organization's own
  // (`shared`, `dedicated`) as much as the three the console knows.
  zoneTypeCounts: ZoneTypeCount[];
};

export type ReleaseDetailLinkedDeploymentZone = Pick<
  DeploymentZone,
  'id' | 'name' | 'slug' | 'type' | 'updatedAt'
>;

export const getReleaseDeploymentZoneCounts = (
  linkedDeploymentZones: ReleaseDetailLinkedDeploymentZone[],
): ReleaseDeploymentZoneCounts => {
  const countByType = new Map<string, number>();
  for (const deploymentZone of linkedDeploymentZones) {
    countByType.set(
      deploymentZone.type,
      (countByType.get(deploymentZone.type) ?? 0) + 1,
    );
  }

  return {
    productionZonesCount: linkedDeploymentZones.filter((deploymentZone) =>
      countsAsProduction(deploymentZone.type),
    ).length,
    zoneTypeCounts: sortZoneTypes(countByType.keys()).map((type) => ({
      count: countByType.get(type) ?? 0,
      type,
    })),
  };
};

export const getLastDeploymentAt = (
  linkedDeploymentZones: ReleaseDetailLinkedDeploymentZone[],
): string | null => {
  if (linkedDeploymentZones.length === 0) {
    return null;
  }

  return linkedDeploymentZones.reduce((latestUpdatedAt, deploymentZone) => {
    return new Date(deploymentZone.updatedAt).getTime() >
      new Date(latestUpdatedAt).getTime()
      ? deploymentZone.updatedAt
      : latestUpdatedAt;
  }, linkedDeploymentZones[0].updatedAt);
};

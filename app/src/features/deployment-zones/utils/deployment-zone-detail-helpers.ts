import type { DeploymentZone, Release } from '@/api-client';

export const getCurrentRelease = (
  releases: Release[],
  releaseId?: string,
): Release | null => {
  if (!releaseId) {
    return null;
  }

  return releases.find((release) => release.id === releaseId) ?? null;
};

export const getPeerDeploymentZones = (
  deploymentZones: DeploymentZone[],
  currentZoneId: string,
  releaseId?: string,
): DeploymentZone[] => {
  if (!releaseId) {
    return [];
  }

  return deploymentZones.filter(
    (zone) => zone.releaseId === releaseId && zone.id !== currentZoneId,
  );
};

export const getSameReleaseZonesCount = (
  deploymentZones: DeploymentZone[],
  releaseId?: string,
): number => {
  if (!releaseId) {
    return 0;
  }

  return deploymentZones.filter((zone) => zone.releaseId === releaseId).length;
};

export const getMetadataKeysCount = (
  metadata: DeploymentZone['metadata'],
): number => Object.keys(metadata ?? {}).length;

import { useSuspenseQuery } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useMemo } from 'react';
import type { DeploymentZone, Release } from '@/api-client';
import { allReleasesOptions } from '@/lib/api/all-pages-query-options';
import { deploymentZonesQueryOptions } from '../../queries';
import {
  getCurrentRelease,
  getMetadataKeysCount,
  getPeerDeploymentZones,
  getSameReleaseZonesCount,
} from '../../utils';

type DeploymentZoneDetailContextValue = {
  currentRelease: Release | null;
  deploymentZone: DeploymentZone;
  metadataKeysCount: number;
  isDeployed: boolean;
  peerZones: DeploymentZone[];
  releases: Release[];
  sameReleaseZonesCount: number;
  zoneSlug: string;
};

const DeploymentZoneDetailContext =
  createContext<DeploymentZoneDetailContextValue | null>(null);

export function DeploymentZoneDetailProvider({
  children,
  deploymentZone,
  zoneSlug,
}: PropsWithChildren<{ deploymentZone: DeploymentZone; zoneSlug: string }>) {
  const { data: deploymentZonesData } = useSuspenseQuery(
    deploymentZonesQueryOptions,
  );
  const { data: releasesData } = useSuspenseQuery(allReleasesOptions());

  const deploymentZones = useMemo(
    () => deploymentZonesData?.items ?? [],
    [deploymentZonesData],
  );
  const releases = useMemo(() => releasesData?.items ?? [], [releasesData]);

  const currentRelease = useMemo(
    () => getCurrentRelease(releases, deploymentZone.releaseId),
    [deploymentZone.releaseId, releases],
  );

  const peerZones = useMemo(() => {
    return getPeerDeploymentZones(
      deploymentZones,
      deploymentZone.id,
      deploymentZone.releaseId,
    );
  }, [deploymentZone.id, deploymentZone.releaseId, deploymentZones]);

  const sameReleaseZonesCount = useMemo(
    () => getSameReleaseZonesCount(deploymentZones, deploymentZone.releaseId),
    [deploymentZone.releaseId, deploymentZones],
  );

  const metadataKeysCount = useMemo(
    () => getMetadataKeysCount(deploymentZone.metadata),
    [deploymentZone.metadata],
  );

  const contextValue = useMemo(
    () => ({
      currentRelease,
      deploymentZone,
      metadataKeysCount,
      isDeployed: Boolean(deploymentZone.releaseId),
      peerZones,
      releases,
      sameReleaseZonesCount,
      zoneSlug,
    }),
    [
      currentRelease,
      deploymentZone,
      metadataKeysCount,
      peerZones,
      releases,
      sameReleaseZonesCount,
      zoneSlug,
    ],
  );

  return (
    <DeploymentZoneDetailContext.Provider value={contextValue}>
      {children}
    </DeploymentZoneDetailContext.Provider>
  );
}

export const useDeploymentZoneDetailContext = () => {
  const context = use(DeploymentZoneDetailContext);

  if (!context) {
    throw new Error(
      'useDeploymentZoneDetailContext must be used within a DeploymentZoneDetailProvider',
    );
  }

  return context;
};

import { useSuspenseQuery } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useMemo } from 'react';
import type { Release } from '@/api-client';
import { allDeploymentZonesOptions } from '@/lib/api/all-pages-query-options';
import {
  getCurrentDeploymentZones,
  getReleaseOverviewStatus,
  releaseManagementOverviewQueryOptions,
  type ReleaseManagementOverviewRelease,
  type ReleaseStatus,
} from '@/domains/release-management';
import {
  getLastDeploymentAt as getLastDeploymentAtFromHelpers,
  getReleaseDeploymentZoneCounts as getReleaseDeploymentZoneCountsFromHelpers,
  type ReleaseDetailLinkedDeploymentZone,
  type ZoneTypeCount,
} from '../../utils';

type ReleaseDetailContextValue = {
  lastDeploymentAt: string | null;
  linkedDeploymentZones: ReleaseDetailLinkedDeploymentZone[];
  productionZonesCount: number;
  release: Release;
  releaseSlug: string;
  status: ReleaseStatus;
  zoneTypeCounts: ZoneTypeCount[];
};

const ReleaseDetailContext = createContext<ReleaseDetailContextValue | null>(
  null,
);

export function ReleaseDetailProvider({
  children,
  release,
  releaseSlug,
}: PropsWithChildren<{ release: Release; releaseSlug: string }>) {
  const { data: deploymentZonesData } = useSuspenseQuery(
    allDeploymentZonesOptions(),
  );
  const { data: overviewReleasesData } = useSuspenseQuery(
    releaseManagementOverviewQueryOptions,
  );
  const deploymentZones = useMemo(
    () => deploymentZonesData?.items ?? [],
    [deploymentZonesData],
  );
  const overviewReleases = useMemo(
    () => overviewReleasesData ?? [],
    [overviewReleasesData],
  );

  const overviewRelease = useMemo<ReleaseManagementOverviewRelease | null>(
    () =>
      overviewReleases.find((candidate) => candidate.id === release.id) ??
      overviewReleases.find((candidate) => candidate.slug === releaseSlug) ??
      null,
    [overviewReleases, release.id, releaseSlug],
  );

  const fallbackLinkedDeploymentZones = useMemo(
    () =>
      deploymentZones.filter(
        (deploymentZone) => deploymentZone.releaseId === release.id,
      ),
    [deploymentZones, release.id],
  );

  const linkedDeploymentZones = useMemo<ReleaseDetailLinkedDeploymentZone[]>(
    // Current zones on both paths. The overview release's deploymentZones is
    // its whole deployment history, which is why this used to disagree with
    // the fallback below -- the fallback was always filtered to the zones whose
    // releaseId is this release.
    () =>
      overviewRelease
        ? getCurrentDeploymentZones(overviewRelease)
        : fallbackLinkedDeploymentZones,
    [fallbackLinkedDeploymentZones, overviewRelease],
  );

  // The overview's history tells Superseded from Planned. A release it does not
  // hold yet (created a moment ago, the overview not refetched) has none: its
  // history is the zones that run it, so it reads Deployed, Staging or Planned.
  const status = useMemo(
    () =>
      getReleaseOverviewStatus(
        overviewRelease ?? {
          deploymentZones: fallbackLinkedDeploymentZones,
          id: release.id,
        },
      ),
    [fallbackLinkedDeploymentZones, overviewRelease, release.id],
  );

  const { productionZonesCount, zoneTypeCounts } = useMemo(
    () => getReleaseDeploymentZoneCountsFromHelpers(linkedDeploymentZones),
    [linkedDeploymentZones],
  );

  const lastDeploymentAt = useMemo(
    () => getLastDeploymentAtFromHelpers(linkedDeploymentZones),
    [linkedDeploymentZones],
  );

  const contextValue = useMemo(
    () => ({
      lastDeploymentAt,
      linkedDeploymentZones,
      productionZonesCount,
      release,
      releaseSlug,
      status,
      zoneTypeCounts,
    }),
    [
      lastDeploymentAt,
      linkedDeploymentZones,
      productionZonesCount,
      release,
      releaseSlug,
      status,
      zoneTypeCounts,
    ],
  );

  return (
    <ReleaseDetailContext.Provider value={contextValue}>
      {children}
    </ReleaseDetailContext.Provider>
  );
}

export const useReleaseDetailContext = () => {
  const context = use(ReleaseDetailContext);

  if (!context) {
    throw new Error(
      'useReleaseDetailContext must be used within a ReleaseDetailProvider',
    );
  }

  return context;
};

import type {
  DeploymentZoneRelations,
  ReleaseManagementOverviewRelease,
} from '../types';
import { countsAsProduction } from './deployment-zone-presentation';
import type { ReleaseStatus } from './release-status';

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  });

/**
 * What the status rule reads of a release: its id and the zones it reached.
 * A `ReleaseManagementOverviewRelease` is one. So is a release the overview
 * does not hold yet, given the zones that run it now -- see
 * getReleaseOverviewStatus.
 */
export type ReleaseDeploymentHistory<
  Zone extends { releaseId?: string | null; type: string } = {
    releaseId?: string | null;
    type: string;
  },
> = {
  deploymentZones?: readonly Zone[] | null;
  id: string;
};

/**
 * The zones this release is running on RIGHT NOW.
 *
 * `release.deploymentZones` is history, not state: the API lists every zone the
 * release was ever deployed to (Release.deploymentZones is documented as "at
 * least once"), read from the append-only deployment log. Each zone in that
 * list carries its CURRENT `releaseId`, though, so the two are told apart by
 * comparing it against this release. A zone that has since moved on to a newer
 * release is still listed, and must not read as running this one.
 */
export function getCurrentDeploymentZones<
  Zone extends { releaseId?: string | null; type: string },
>(release: ReleaseDeploymentHistory<Zone>): Zone[] {
  return (release.deploymentZones ?? []).filter(
    (zone) => zone.releaseId === release.id,
  );
}

/**
 * The status of a release, the same on every screen that shows one: `Deployed`
 * when a zone that counts as production runs it now -- a production zone, or
 * one whose type the organization named for its own -- `Staging` when only
 * staging and development zones do, `Superseded` when it ran somewhere and has
 * since been replaced everywhere, `Planned` when it never reached a zone.
 *
 * Telling `Superseded` from `Planned` takes the zones a release ever reached,
 * which is what `Release.deploymentZones` holds in the overview and what
 * neither REST endpoint returns -- a zone only knows the release it runs now.
 * A screen that lists releases from REST must therefore look the status up in
 * the overview, not work it out from the zones. The one exception is a release
 * the overview does not hold yet (a release created a moment ago, before the
 * overview refetched): pass the zones that run it, as its history. Nothing is
 * known of an earlier run, so it reads `Deployed`, `Staging` or `Planned`.
 *
 * This replaces a status computed from the whole deployment history, which kept
 * every release that ever reached production marked `Deployed` forever. It went
 * unnoticed until a zone first moved from one release to the next.
 */
export function getReleaseOverviewStatus(
  release: ReleaseDeploymentHistory,
): ReleaseStatus {
  const currentZones = getCurrentDeploymentZones(release);

  if (currentZones.some((zone) => countsAsProduction(zone.type))) {
    return 'Deployed';
  }

  if (currentZones.length > 0) {
    return 'Staging';
  }

  if ((release.deploymentZones ?? []).length > 0) {
    return 'Superseded';
  }

  return 'Planned';
}

export function getReleaseOverviewStats(
  releases: ReleaseManagementOverviewRelease[],
) {
  return {
    deployed: releases.filter(
      (release) => getReleaseOverviewStatus(release) === 'Deployed',
    ).length,
    planned: releases.filter(
      (release) => getReleaseOverviewStatus(release) === 'Planned',
    ).length,
    staging: releases.filter(
      (release) => getReleaseOverviewStatus(release) === 'Staging',
    ).length,
    superseded: releases.filter(
      (release) => getReleaseOverviewStatus(release) === 'Superseded',
    ).length,
    total: releases.length,
  };
}

export function buildDeploymentZoneRelations(
  releases: ReleaseManagementOverviewRelease[],
) {
  const relationsByZoneId = new Map<string, DeploymentZoneRelations>();

  for (const release of releases) {
    for (const deploymentZone of release.deploymentZones ?? []) {
      const existing = relationsByZoneId.get(deploymentZone.id) ?? {
        instances: [],
        releases: [],
      };

      if (!existing.releases.some((item) => item.id === release.id)) {
        existing.releases = [
          ...existing.releases,
          {
            createdAt: release.createdAt,
            description: release.description,
            id: release.id,
            slug: release.slug,
            version: release.version,
          },
        ];
      }

      relationsByZoneId.set(deploymentZone.id, existing);
    }

    for (const instance of release.instances ?? []) {
      if (!instance.deploymentZoneId) {
        continue;
      }

      const existing = relationsByZoneId.get(instance.deploymentZoneId) ?? {
        instances: [],
        releases: [],
      };

      if (!existing.instances.some((item) => item.id === instance.id)) {
        existing.instances = [
          ...existing.instances,
          {
            customerName: instance.customer?.name,
            deploymentZoneId: instance.deploymentZoneId,
            description: instance.description,
            id: instance.id,
            name: instance.name,
            slug: instance.slug,
          },
        ];
      }

      relationsByZoneId.set(instance.deploymentZoneId, existing);
    }
  }

  for (const [zoneId, relations] of relationsByZoneId.entries()) {
    relationsByZoneId.set(zoneId, {
      instances: [...relations.instances].sort((left, right) =>
        compareText(left.name, right.name),
      ),
      releases: [...relations.releases].sort((left, right) =>
        compareText(left.version, right.version),
      ),
    });
  }

  return relationsByZoneId;
}

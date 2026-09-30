import { describe, expect, it } from 'vite-plus/test';
import type { ReleaseManagementOverviewRelease } from '../../types';
import {
  buildDeploymentZoneRelations,
  getCurrentDeploymentZones,
  getReleaseOverviewStats,
  getReleaseOverviewStatus,
} from '../release-management-overview';

const buildRelease = (
  overrides: Partial<ReleaseManagementOverviewRelease> & {
    id: string;
    version: string;
  },
) => {
  const { id, version, ...rest } = overrides;

  return {
    components: [],
    createdAt: '2026-03-01T10:00:00.000Z',
    createdBy: { id: 'user-1', name: 'Jane Doe' },
    deploymentZones: [],
    description: null,
    id,
    instances: [],
    slug: `${id}-slug`,
    ...rest,
    version,
  } as ReleaseManagementOverviewRelease;
};


// A deployment zone as Release.deploymentZones returns it. `releaseId` is the
// zone's CURRENT release -- the same value on every release that lists the
// zone -- which is the whole point of the cases below.
const buildZone = (id: string, type: string, releaseId: string) => ({
  createdAt: '2026-03-01T10:00:00.000Z',
  description: `${id} zone`,
  id,
  name: id,
  releaseId,
  slug: id,
  type,
  updatedAt: '2026-03-01T10:00:00.000Z',
});

describe('release-management-overview', () => {
  describe('getReleaseOverviewStatus', () => {
    it('returns Deployed when one linked zone is production', () => {
      const release = buildRelease({
        deploymentZones: [
          {
            createdAt: '2026-03-01T10:00:00.000Z',
            description: 'Production zone',
            id: 'zone-production',
            name: 'Production',
            releaseId: 'release-prod',
            slug: 'production',
            type: 'production',
            updatedAt: '2026-03-01T10:00:00.000Z',
          },
        ],
        id: 'release-prod',
        version: 'Release 2026.03',
      });

      expect(getReleaseOverviewStatus(release)).toBe('Deployed');
    });

    it('returns Staging when linked zones exist without production', () => {
      const release = buildRelease({
        deploymentZones: [
          {
            createdAt: '2026-03-01T10:00:00.000Z',
            description: 'Staging zone',
            id: 'zone-staging',
            name: 'Staging',
            releaseId: 'release-staging',
            slug: 'staging',
            type: 'staging',
            updatedAt: '2026-03-01T10:00:00.000Z',
          },
        ],
        id: 'release-staging',
        version: 'Release 2026.04',
      });

      expect(getReleaseOverviewStatus(release)).toBe('Staging');
    });

    // The demo's zones are typed `shared` and `dedicated`: how they are
    // isolated, not a class the console knows. They count as production.
    it('returns Deployed when it runs on zones of the organization\'s own types', () => {
      const release = buildRelease({
        deploymentZones: [
          buildZone('shared-apac', 'shared', 'release-2026-8'),
          buildZone('sakura-dedicated', 'dedicated', 'release-2026-8'),
        ],
        id: 'release-2026-8',
        version: '2026.8.0',
      });

      expect(getReleaseOverviewStatus(release)).toBe('Deployed');
    });

    it('returns Planned when the release has no linked zones', () => {
      const release = buildRelease({
        id: 'release-planned',
        version: 'Release 2026.05',
      });

      expect(getReleaseOverviewStatus(release)).toBe('Planned');
    });

    // The reported bug. 26.09.5 replaced 26.09.4 on both zones, and the API
    // still lists both zones on 26.09.4 because they ran it once.
    it('returns Superseded when every zone that ran the release has moved on', () => {
      const release = buildRelease({
        deploymentZones: [
          buildZone('kaiten', 'production', 'release-26-09-5'),
          buildZone('demo', 'production', 'release-26-09-5'),
        ],
        id: 'release-26-09-4',
        version: '26.09.4',
      });

      expect(getReleaseOverviewStatus(release)).toBe('Superseded');
    });

    it('returns Deployed from the zone that still runs it, not the one that moved on', () => {
      const release = buildRelease({
        deploymentZones: [
          buildZone('kaiten', 'production', 'release-26-09-5'),
          buildZone('demo', 'production', 'release-26-09-4'),
        ],
        id: 'release-26-09-4',
        version: '26.09.4',
      });

      expect(getReleaseOverviewStatus(release)).toBe('Deployed');
    });

    it('does not count a production zone that moved on toward Deployed', () => {
      const release = buildRelease({
        deploymentZones: [
          buildZone('prod', 'production', 'release-newer'),
          buildZone('staging', 'staging', 'release-old'),
        ],
        id: 'release-old',
        version: 'old',
      });

      expect(getReleaseOverviewStatus(release)).toBe('Staging');
    });

    it('returns Staging when only development zones run it', () => {
      const release = buildRelease({
        deploymentZones: [buildZone('sandbox', 'development', 'release-dev')],
        id: 'release-dev',
        version: 'dev',
      });

      expect(getReleaseOverviewStatus(release)).toBe('Staging');
    });

    it('prefers Deployed over Staging when both kinds of zone run it', () => {
      const release = buildRelease({
        deploymentZones: [
          buildZone('staging', 'staging', 'release-both'),
          buildZone('prod', 'production', 'release-both'),
        ],
        id: 'release-both',
        version: 'both',
      });

      expect(getReleaseOverviewStatus(release)).toBe('Deployed');
    });

    // A release the overview does not hold yet has no history to read: the
    // only zones known are the ones that run it, as REST returns them (a zone
    // carries its current release). It can read Deployed, Staging or Planned,
    // never Superseded.
    describe('for a release given only the zones that run it', () => {
      const restZone = (id: string, type: string) => ({
        id,
        releaseId: 'release-new',
        type,
      });

      it('reads Deployed from a production zone', () => {
        expect(
          getReleaseOverviewStatus({
            deploymentZones: [restZone('prod', 'production')],
            id: 'release-new',
          }),
        ).toBe('Deployed');
      });

      it('reads Staging from a staging zone', () => {
        expect(
          getReleaseOverviewStatus({
            deploymentZones: [restZone('staging', 'staging')],
            id: 'release-new',
          }),
        ).toBe('Staging');
      });

      it('reads Planned from no zone', () => {
        expect(
          getReleaseOverviewStatus({ deploymentZones: [], id: 'release-new' }),
        ).toBe('Planned');
      });
    });
  });

  describe('getCurrentDeploymentZones', () => {
    it('keeps only the zones whose current release is this one', () => {
      const release = buildRelease({
        deploymentZones: [
          buildZone('kaiten', 'production', 'release-26-09-5'),
          buildZone('demo', 'production', 'release-26-09-4'),
        ],
        id: 'release-26-09-4',
        version: '26.09.4',
      });

      expect(getCurrentDeploymentZones(release).map((zone) => zone.id)).toEqual([
        'demo',
      ]);
    });

    it('returns nothing for a release with no deployment history', () => {
      expect(
        getCurrentDeploymentZones(buildRelease({ id: 'r', version: 'r' })),
      ).toEqual([]);
    });
  });

  describe('getReleaseOverviewStats', () => {
    it('aggregates deployed, staging, planned and total counts', () => {
      const releases = [
        buildRelease({
          deploymentZones: [
            {
              createdAt: '2026-03-01T10:00:00.000Z',
              description: 'Production zone',
              id: 'zone-production',
              name: 'Production',
              releaseId: 'release-prod',
              slug: 'production',
              type: 'production',
              updatedAt: '2026-03-01T10:00:00.000Z',
            },
          ],
          id: 'release-prod',
          version: 'Release 2026.03',
        }),
        buildRelease({
          deploymentZones: [
            {
              createdAt: '2026-03-01T10:00:00.000Z',
              description: 'Staging zone',
              id: 'zone-staging',
              name: 'Staging',
              releaseId: 'release-staging',
              slug: 'staging',
              type: 'staging',
              updatedAt: '2026-03-01T10:00:00.000Z',
            },
          ],
          id: 'release-staging',
          version: 'Release 2026.04',
        }),
        buildRelease({
          id: 'release-planned',
          version: 'Release 2026.05',
        }),
        buildRelease({
          deploymentZones: [buildZone('zone-production', 'production', 'release-prod')],
          id: 'release-replaced',
          version: 'Release 2026.02',
        }),
      ];

      expect(getReleaseOverviewStats(releases)).toEqual({
        deployed: 1,
        planned: 1,
        staging: 1,
        superseded: 1,
        total: 4,
      });
    });
  });

  describe('buildDeploymentZoneRelations', () => {
    it('groups unique releases and instances by zone and sorts them', () => {
      const releases = [
        buildRelease({
          createdAt: '2026-03-20T10:00:00.000Z',
          deploymentZones: [
            {
              createdAt: '2026-03-20T10:00:00.000Z',
              description: 'Zone A',
              id: 'zone-a',
              name: 'Zone A',
              releaseId: 'release-2',
              slug: 'zone-a',
              type: 'staging',
              updatedAt: '2026-03-20T10:00:00.000Z',
            },
          ],
          id: 'release-2',
          instances: [
            {
              customer: { id: 'customer-beta', name: 'Beta Corp' },
              deploymentZoneId: 'zone-a',
              description: 'Secondary instance',
              id: 'instance-b',
              name: 'Zeta Web',
              slug: 'zeta-web',
            },
          ],
          version: 'Release 2026.10',
        }),
        buildRelease({
          createdAt: '2026-03-10T10:00:00.000Z',
          deploymentZones: [
            {
              createdAt: '2026-03-10T10:00:00.000Z',
              description: 'Zone A',
              id: 'zone-a',
              name: 'Zone A',
              releaseId: 'release-1',
              slug: 'zone-a',
              type: 'staging',
              updatedAt: '2026-03-10T10:00:00.000Z',
            },
          ],
          id: 'release-1',
          instances: [
            {
              customer: { id: 'customer-acme', name: 'Acme Corp' },
              deploymentZoneId: 'zone-a',
              description: 'Primary instance',
              id: 'instance-a',
              name: 'Alpha Web',
              slug: 'alpha-web',
            },
            {
              customer: { id: 'customer-acme', name: 'Acme Corp' },
              deploymentZoneId: 'zone-a',
              description: 'Primary instance',
              id: 'instance-a',
              name: 'Alpha Web',
              slug: 'alpha-web',
            },
          ],
          version: 'Release 2026.2',
        }),
      ];

      const relationsByZoneId = buildDeploymentZoneRelations(releases);

      expect(relationsByZoneId.get('zone-a')).toEqual({
        instances: [
          {
            customerName: 'Acme Corp',
            deploymentZoneId: 'zone-a',
            description: 'Primary instance',
            id: 'instance-a',
            name: 'Alpha Web',
            slug: 'alpha-web',
          },
          {
            customerName: 'Beta Corp',
            deploymentZoneId: 'zone-a',
            description: 'Secondary instance',
            id: 'instance-b',
            name: 'Zeta Web',
            slug: 'zeta-web',
          },
        ],
        releases: [
          {
            createdAt: '2026-03-10T10:00:00.000Z',
            description: null,
            id: 'release-1',
            slug: 'release-1-slug',
            version: 'Release 2026.2',
          },
          {
            createdAt: '2026-03-20T10:00:00.000Z',
            description: null,
            id: 'release-2',
            slug: 'release-2-slug',
            version: 'Release 2026.10',
          },
        ],
      });
    });
  });
});

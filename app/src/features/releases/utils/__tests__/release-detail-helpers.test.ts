import { describe, expect, it } from 'vite-plus/test';
import {
  getLastDeploymentAt,
  type ReleaseDetailLinkedDeploymentZone,
  getReleaseDeploymentZoneCounts,
} from '../release-detail-helpers';

const makeZone = (
  overrides: Partial<ReleaseDetailLinkedDeploymentZone> = {},
): ReleaseDetailLinkedDeploymentZone => ({
  id: 'zone-1',
  name: 'Zone',
  type: 'development',
  slug: 'zone-1',
  updatedAt: '2025-01-01T00:00:00Z',
  ...overrides,
});

describe('release-detail-helpers', () => {
  describe('getReleaseDeploymentZoneCounts', () => {
    it('counts each type present, the three classes first', () => {
      const linkedZones = [
        makeZone({ id: 'zone-dev-1', type: 'development' }),
        makeZone({ id: 'zone-prod', type: 'production' }),
        makeZone({ id: 'zone-dev-2', type: 'development' }),
        makeZone({ id: 'zone-staging', type: 'staging' }),
      ];

      expect(getReleaseDeploymentZoneCounts(linkedZones)).toEqual({
        productionZonesCount: 1,
        zoneTypeCounts: [
          { count: 1, type: 'production' },
          { count: 1, type: 'staging' },
          { count: 2, type: 'development' },
        ],
      });
    });

    // Before, anything that was neither production nor staging was counted
    // as development -- a `dedicated` production zone included.
    it('counts an organization\'s own types as they are, and as production', () => {
      const linkedZones = [
        makeZone({ id: 'sakura-dedicated', type: 'dedicated' }),
        makeZone({ id: 'shared-eu', type: 'shared' }),
        makeZone({ id: 'shared-apac', type: 'shared' }),
        makeZone({ id: 'zone-staging', type: 'staging' }),
      ];

      expect(getReleaseDeploymentZoneCounts(linkedZones)).toEqual({
        productionZonesCount: 3,
        zoneTypeCounts: [
          { count: 1, type: 'staging' },
          { count: 1, type: 'dedicated' },
          { count: 2, type: 'shared' },
        ],
      });
    });

    it('returns no type and no production zone when no linked zones are provided', () => {
      expect(getReleaseDeploymentZoneCounts([])).toEqual({
        productionZonesCount: 0,
        zoneTypeCounts: [],
      });
    });
  });

  describe('getLastDeploymentAt', () => {
    it('returns null when there are no linked zones', () => {
      expect(getLastDeploymentAt([])).toBeNull();
    });

    it('returns the most recent updatedAt value across linked overview zones', () => {
      const linkedZones = [
        makeZone({
          id: 'zone-1',
          updatedAt: '2025-02-01T00:00:00Z',
        }),
        makeZone({
          id: 'zone-2',
          updatedAt: '2025-03-01T00:00:00Z',
        }),
        makeZone({
          id: 'zone-3',
          updatedAt: '2025-01-15T00:00:00Z',
        }),
      ];

      expect(getLastDeploymentAt(linkedZones)).toBe('2025-03-01T00:00:00Z');
    });
  });
});

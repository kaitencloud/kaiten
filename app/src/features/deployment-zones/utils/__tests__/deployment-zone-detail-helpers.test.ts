import { describe, expect, it } from 'vite-plus/test';
import type { DeploymentZone, Release } from '@/api-client';
import {
  getCurrentRelease,
  getMetadataKeysCount,
  getPeerDeploymentZones,
  getSameReleaseZonesCount,
} from '../deployment-zone-detail-helpers';

const makeRelease = (overrides: Partial<Release> = {}): Release => ({
  id: 'release-1',
  version: '1.0.0',
  description: 'Release description',
  slug: 'release-1-0-0',
  createdAt: '2025-01-01T00:00:00Z',
  createdBy: { id: 'user-1', name: 'User 1' },
  ...overrides,
});

const makeZone = (
  overrides: Partial<DeploymentZone> = {},
): DeploymentZone => ({
  id: 'zone-1',
  name: 'Zone',
  type: 'development',
  description: 'Zone description',
  metadata: {},
  releaseId: undefined,
  slug: 'zone-1',
  createdAt: '2025-01-01T00:00:00Z',
  createdBy: { id: 'user-1', name: 'User 1' },
  updatedAt: '2025-01-01T00:00:00Z',
  updatedBy: { id: 'user-1', name: 'User 1' },
  ...overrides,
});

describe('deployment-zone-detail-helpers', () => {
  describe('getCurrentRelease', () => {
    it('returns null when there is no releaseId', () => {
      expect(getCurrentRelease([makeRelease()], undefined)).toBeNull();
    });

    it('returns the matching release by releaseId', () => {
      const releases = [
        makeRelease({ id: 'release-1', version: '1.0.0' }),
        makeRelease({ id: 'release-2', version: '2.0.0' }),
      ];

      expect(getCurrentRelease(releases, 'release-2')).toEqual(releases[1]);
    });
  });

  describe('getPeerDeploymentZones', () => {
    it('returns only other zones sharing the same releaseId', () => {
      const zones = [
        makeZone({ id: 'zone-a', releaseId: 'release-1' }),
        makeZone({ id: 'zone-b', releaseId: 'release-1' }),
        makeZone({ id: 'zone-c', releaseId: 'release-2' }),
      ];

      expect(getPeerDeploymentZones(zones, 'zone-a', 'release-1')).toEqual([
        zones[1],
      ]);
    });

    it('returns an empty array when releaseId is missing', () => {
      const zones = [makeZone({ id: 'zone-a', releaseId: 'release-1' })];
      expect(getPeerDeploymentZones(zones, 'zone-a', undefined)).toEqual([]);
    });
  });

  describe('getSameReleaseZonesCount', () => {
    it('returns number of zones sharing a releaseId', () => {
      const zones = [
        makeZone({ id: 'zone-a', releaseId: 'release-1' }),
        makeZone({ id: 'zone-b', releaseId: 'release-1' }),
        makeZone({ id: 'zone-c', releaseId: 'release-2' }),
      ];

      expect(getSameReleaseZonesCount(zones, 'release-1')).toBe(2);
    });

    it('returns 0 when releaseId is missing', () => {
      expect(getSameReleaseZonesCount([makeZone()], undefined)).toBe(0);
    });
  });

  describe('getMetadataKeysCount', () => {
    it('counts feature keys', () => {
      expect(getMetadataKeysCount({ a: true, b: 2, c: 'three' })).toBe(3);
    });

    it('returns 0 when features are undefined', () => {
      expect(getMetadataKeysCount(undefined)).toBe(0);
    });
  });
});

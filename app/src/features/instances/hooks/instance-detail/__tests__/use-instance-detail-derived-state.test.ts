vi.mock('@/domains/ai-credits/use-ai-access', () => ({ useAiAccess: () => ({ available: false }) }));
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { ReleaseManagementOverviewRelease } from '@/domains/release-management';
import { useInstanceDetailDerivedState } from '../use-instance-detail-derived-state';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

type Params = Parameters<typeof useInstanceDetailDerivedState>[0];

const actor = { id: 'user-1', name: 'Jane Doe' };

const instance = {
  createdBy: actor,
  deploymentZoneId: 'zone-1',
  endLicenseDate: '2027-01-01T00:00:00.000Z',
  startLicenseDate: '2026-01-01T00:00:00.000Z',
  updatedBy: actor,
} as unknown as Params['instance'];

const zone = (type: string) =>
  ({
    id: 'zone-1',
    name: 'Zone 1',
    releaseId: 'release-1',
    slug: 'zone-1',
    type,
    updatedAt: '2026-03-01T10:00:00.000Z',
    updatedBy: actor,
  }) as unknown as Params['deploymentZones'][number];

const restRelease = {
  id: 'release-1',
  slug: 'release-1',
  version: 'v1.0.0',
} as unknown as Params['releases'][number];

const overviewRelease = (
  deploymentZones: Array<{ id: string; releaseId: string; type: string }>,
) =>
  ({
    deploymentZones: deploymentZones.map((overviewZone) => ({
      ...overviewZone,
      name: overviewZone.id,
      slug: overviewZone.id,
    })),
    id: 'release-1',
    slug: 'release-1',
    version: 'v1.0.0',
  }) as unknown as ReleaseManagementOverviewRelease;

const releaseStatusOf = (
  overviewReleases: ReleaseManagementOverviewRelease[],
  deploymentZoneType: string,
  releases: Params['releases'] = [restRelease],
) =>
  renderHook(() =>
    useInstanceDetailDerivedState({
      deploymentZones: [zone(deploymentZoneType)],
      entitlementUsages: [],
      entitlements: [],
      instance,
      licenseEntitlements: [],
      overviewReleases,
      releases,
    }),
  ).result.current.releaseStatus;

describe('useInstanceDetailDerivedState release status', () => {
  it('reads the status the releases pages give the release of the overview', () => {
    expect(
      releaseStatusOf(
        [overviewRelease([{ id: 'zone-1', releaseId: 'release-1', type: 'production' }])],
        'production',
      ),
    ).toBe('Deployed');
    expect(
      releaseStatusOf(
        [overviewRelease([{ id: 'zone-1', releaseId: 'release-1', type: 'staging' }])],
        'staging',
      ),
    ).toBe('Staging');
  });

  // The overview has not caught up with a release created a moment ago: the
  // zone that runs it is all there is to go by, and its type decides.
  it('reads a release the overview does not hold from the type of the zone that runs it', () => {
    expect(releaseStatusOf([], 'production')).toBe('Deployed');
    expect(releaseStatusOf([], 'dedicated')).toBe('Deployed');
    expect(releaseStatusOf([], 'staging')).toBe('Staging');
    expect(releaseStatusOf([], 'development')).toBe('Staging');
  });

  it('has no status when the release cannot be resolved', () => {
    expect(releaseStatusOf([], 'production', [])).toBeNull();
  });
});

it('filters live AI rows before metrics by their original type while retaining canonical evidence', () => {
  const { result } = renderHook(() => useInstanceDetailDerivedState({
    instance: {} as never,
    entitlements: [{ id: 'ordinary', name: 'Seats', slug: 'seats', type: 'NUMBER' }, { id: 'ai', name: 'Credits', slug: 'credits', type: 'NUMBER_AI_CREDIT' }] as never,
    licenseEntitlements: [{ entitlementName: 'Seats', entitlementSlug: 'seats', entitlementType: 'NUMBER', value: { type: 'number', value: 10 } }, { entitlementName: 'Credits', entitlementSlug: 'credits', entitlementType: 'NUMBER_AI_CREDIT', value: { type: 'number', value: 100 } }] as never,
    entitlementUsages: [], deploymentZones: [], overviewReleases: [], releases: [],
  }));
  expect(result.current.entitlementsRows.map((row) => row.entitlementSlug)).toEqual(['seats']);
  expect(result.current.entitlementsMetrics.total).toBe(1);
  expect(result.current.canonicalEntitlementsRows).toHaveLength(2);
  expect(result.current.canonicalEntitlementsRows[1]).toMatchObject({ entitlementType: 'NUMBER', catalogueEntitlementType: 'NUMBER_AI_CREDIT' });
});

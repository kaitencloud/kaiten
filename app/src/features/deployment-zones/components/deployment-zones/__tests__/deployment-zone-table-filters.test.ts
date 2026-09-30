import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import type { DeploymentZone, Release } from '@/api-client';
import type { MetadataFieldDescriptor } from '@/functionals/metadata-fields';
import { createDeploymentZoneFilterFields } from '../deployment-zone-table-filters';

const t: TFunction = ((key: string, fallback?: string) =>
  fallback ?? key) as unknown as TFunction;

const fakeZone: DeploymentZone = {
  id: 'zone-1',
  name: 'EU prod',
  slug: 'eu-prod',
  type: 'production',
  description: 'desc',
  metadata: { region: 'eu' },
  releaseId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as unknown as DeploymentZone;

const fakeReleases: Release[] = [];

describe('createDeploymentZoneFilterFields', () => {
  // An empty schema keeps the legacy boolean "has metadata"
  // filter so the page stays usable on orgs that haven't declared any
  // typed field yet.
  it('falls back to a hasMetadata boolean when no MetadataField is declared', () => {
    const filters = createDeploymentZoneFilterFields([fakeZone], fakeReleases, t);
    const ids = filters.map((f) => f.id);
    expect(ids).toContain('hasMetadata');
    expect(ids).not.toContain('metadata.region');
  });

  // One typed filter per active MetadataField. The
  // hasMetadata boolean is dropped because the typed filters cover the
  // same ground with finer granularity.
  it('injects typed filters and drops hasMetadata when schemas are declared', () => {
    const metadataFields: MetadataFieldDescriptor[] = [
      {
        archivedAt: null,
        displayOrder: 0,
        id: 'field-region',
        jsonSchema: { type: 'string', enum: ['eu', 'us'] },
        key: 'region',
        label: 'Region',
      },
      {
        archivedAt: null,
        displayOrder: 1,
        id: 'field-tier',
        jsonSchema: { type: 'string' },
        key: 'tier',
        label: 'Tier',
      },
    ];
    const filters = createDeploymentZoneFilterFields(
      [fakeZone],
      fakeReleases,
      t,
      metadataFields,
    );
    const ids = filters.map((f) => f.id);
    expect(ids).toContain('metadata.region');
    expect(ids).toContain('metadata.tier');
    expect(ids).not.toContain('hasMetadata');
  });

  // The typed filter must read from the zone's `metadata` jsonb at the
  // declared key — that's the contract `buildFiltersFromSchema` builds on
  // and the table filtering depends on.
  it('typed filter reads the metadata value at the declared key', () => {
    const metadataFields: MetadataFieldDescriptor[] = [
      {
        archivedAt: null,
        displayOrder: 0,
        id: 'field-region',
        jsonSchema: { type: 'string' },
        key: 'region',
        label: 'Region',
      },
    ];
    const filters = createDeploymentZoneFilterFields(
      [fakeZone],
      fakeReleases,
      t,
      metadataFields,
    );
    const regionFilter = filters.find((f) => f.id === 'metadata.region');
    expect(regionFilter).toBeDefined();
    expect(regionFilter?.accessor(fakeZone)).toBe('eu');
  });
});

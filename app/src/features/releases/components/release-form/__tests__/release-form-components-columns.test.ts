import { describe, expect, it } from 'vite-plus/test';
import type { ReleaseFormValues } from '../../../schemas/release.schema';
import { buildComponentRows } from '../release-form-components-columns';

const makeComponent = (id: string, name: string, version: string) => ({
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: { id: 'user-1', name: 'Alice' },
  description: `${name} desc`,
  id,
  name,
  slug: `${name.toLowerCase().replace(/ /g, '-')}-${version}`,
  version,
});

const makeRelease = (id: string, version: string, components: any[]) => ({
  components,
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: { id: 'user-1', name: 'Alice' },
  deploymentZones: [],
  description: '',
  id,
  instances: [],
  slug: id,
  updatedAt: '2026-01-01T00:00:00Z',
  updatedBy: { id: 'user-1', name: 'Alice' },
  version,
});

const comp1 = makeComponent('c-1', 'Billing API', '1.0.0');
const comp2 = makeComponent('c-2', 'Portal UI', '2.0.0');
const previousRelease = makeRelease('rel-1', 'v1.0.0', [comp1]);

const baseValues: ReleaseFormValues = {
  componentPatches: [],
  creationMode: 'scratch',
  description: '',
  previousReleaseId: '',
  selectedComponentIds: [],
  slug: '',
  version: '',
};

describe('buildComponentRows', () => {
  it('returns empty rows for scratch mode with no components', () => {
    const rows = buildComponentRows(baseValues, undefined, []);
    expect(rows).toEqual([]);
  });

  it('returns inherited rows from a previous release', () => {
    const values = {
      ...baseValues,
      creationMode: 'existing' as const,
      previousReleaseId: 'rel-1',
    };
    const rows = buildComponentRows(values, previousRelease, [comp1, comp2]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'inherited-c-1',
      name: 'Billing API',
      source: 'inherited',
    });
  });

  it('returns catalog rows from selectedComponentIds', () => {
    const values = { ...baseValues, selectedComponentIds: ['c-2'] };
    const rows = buildComponentRows(values, undefined, [comp1, comp2]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'catalog-c-2',
      name: 'Portal UI',
      source: 'catalog',
    });
  });

  it('returns added rows from componentPatches', () => {
    const values: ReleaseFormValues = {
      ...baseValues,
      componentPatches: [
        {
          componentId: '',
          componentSlug: '',
          description: 'Brand new',
          name: 'New Service',
          op: 'add',
          resolvedForkComponentId: '',
          slug: '',
          version: '0.1.0',
        },
      ],
    };
    const rows = buildComponentRows(values, undefined, []);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'added-0',
      name: 'New Service',
      source: 'added',
      version: '0.1.0',
    });
  });

  it('marks inherited rows as removed when patch has op=remove', () => {
    const values: ReleaseFormValues = {
      ...baseValues,
      componentPatches: [
        {
          componentId: 'c-1',
          componentSlug: 'billing-api-1.0.0',
          description: '',
          name: '',
          op: 'remove',
          resolvedForkComponentId: '',
          slug: '',
          version: '',
        },
      ],
      creationMode: 'existing',
      previousReleaseId: 'rel-1',
    };
    const rows = buildComponentRows(values, previousRelease, [comp1]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'inherited',
      status: 'removed',
    });
  });

  it('combines inherited, catalog, and added rows', () => {
    const values: ReleaseFormValues = {
      ...baseValues,
      componentPatches: [
        {
          componentId: '',
          componentSlug: '',
          description: '',
          name: 'Added',
          op: 'add',
          resolvedForkComponentId: '',
          slug: '',
          version: '1.0.0',
        },
      ],
      creationMode: 'existing',
      previousReleaseId: 'rel-1',
      selectedComponentIds: ['c-2'],
    };
    const rows = buildComponentRows(values, previousRelease, [comp1, comp2]);

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.source)).toEqual([
      'inherited',
      'catalog',
      'added',
    ]);
  });
});

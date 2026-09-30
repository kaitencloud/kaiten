import { describe, expect, it } from 'vite-plus/test';
import type { Component } from '@/api-client';
import type { ComponentCatalogSourceRelease } from '../../types';
import {
  buildComponentCatalogRows,
  getComponentCatalogEntryId,
  getComponentCatalogEntryVersions,
  getComponentCatalogStats,
  groupComponentCatalogRows,
} from '../components-catalog';

type SourceComponent = NonNullable<ComponentCatalogSourceRelease['components']>[number];
type TestComponent = Component & SourceComponent;
type TestUser = TestComponent['createdBy'];

const author: TestUser = {
  id: 'user-1',
  name: 'Jane Doe',
};

const buildComponent = (
  overrides: Partial<TestComponent> &
    Pick<TestComponent, 'id' | 'name' | 'version'>,
): TestComponent => ({
  createdAt: '2026-03-01T10:00:00.000Z',
  createdBy: author,
  description: '',
  previousComponentId: '',
  slug: `${overrides.id}-slug`,
  ...overrides,
});

const buildRelease = (
  overrides: Pick<
    ComponentCatalogSourceRelease,
    'createdAt' | 'id' | 'slug' | 'version'
  > & {
    components?: ComponentCatalogSourceRelease['components'];
    deploymentZones?: ComponentCatalogSourceRelease['deploymentZones'];
  } & Record<string, unknown>,
): ComponentCatalogSourceRelease => ({
  components: [],
  deploymentZones: [],
  ...overrides,
});

describe('components-catalog', () => {
  it('deduplicates components by id and aggregates linked releases', () => {
    const billingApi = buildComponent({
      id: 'component-billing',
      name: 'Billing API',
      previousComponentId: 'component-billing-previous',
      version: '1.2.3',
    });
    const portalUi = buildComponent({
      id: 'component-portal',
      name: 'Portal UI',
      version: '0.9.0',
    });

    const components = buildComponentCatalogRows(
      [billingApi, portalUi],
      [
        buildRelease({
          components: [billingApi],
          createdAt: '2026-03-01T10:00:00.000Z',
          createdBy: author,
          id: 'release-march',
          slug: 'release-2026-03',
          updatedAt: '2026-03-01T10:00:00.000Z',
          version: 'Release 2026.03',
        }),
        buildRelease({
          components: [billingApi],
          createdAt: '2026-04-01T10:00:00.000Z',
          createdBy: author,
          id: 'release-april',
          slug: 'release-2026-04',
          updatedAt: '2026-04-01T10:00:00.000Z',
          version: 'Release 2026.04',
        }),
      ],
    );

    expect(components).toHaveLength(2);
    expect(components[0]).toMatchObject({
      id: 'component-billing',
      name: 'Billing API',
      releaseCount: 2,
      releases: [
        {
          createdAt: '2026-03-01T10:00:00.000Z',
          id: 'release-march',
          slug: 'release-2026-03',
          version: 'Release 2026.03',
        },
        {
          createdAt: '2026-04-01T10:00:00.000Z',
          id: 'release-april',
          slug: 'release-2026-04',
          version: 'Release 2026.04',
        },
      ],
      version: '1.2.3',
    });
    expect(components[1]).toMatchObject({
      id: 'component-portal',
      name: 'Portal UI',
      releaseCount: 0,
      releases: [],
      version: '0.9.0',
    });
  });

  // A zone carries its CURRENT release, whichever release lists it: the old
  // release still lists the zone it ran on, which now runs the new one.
  it('gives each release the status the releases pages give it, a superseded one included', () => {
    const billingApi = buildComponent({
      id: 'component-billing',
      name: 'Billing API',
      version: '1.2.3',
    });
    const zone = (id: string, type: string, releaseId: string) =>
      ({
        createdAt: '2026-03-01T10:00:00.000Z',
        description: id,
        id,
        name: id,
        releaseId,
        slug: id,
        type,
        updatedAt: '2026-03-01T10:00:00.000Z',
      }) as ComponentCatalogSourceRelease['deploymentZones'][number];
    const release = (
      id: string,
      deploymentZones: ComponentCatalogSourceRelease['deploymentZones'],
    ) =>
      buildRelease({
        components: [billingApi],
        createdAt: '2026-03-01T10:00:00.000Z',
        deploymentZones,
        id,
        slug: id,
        version: id,
      });

    const [row] = buildComponentCatalogRows(
      [billingApi],
      [
        release('release-superseded', [
          zone('production', 'production', 'release-deployed'),
        ]),
        release('release-deployed', [
          zone('production', 'production', 'release-deployed'),
        ]),
        release('release-staging', [
          zone('staging', 'staging', 'release-staging'),
        ]),
        release('release-planned', []),
      ],
    );

    expect(
      Object.fromEntries(row.releases.map((r) => [r.id, r.status])),
    ).toEqual({
      'release-deployed': 'Deployed',
      'release-planned': 'Planned',
      'release-staging': 'Staging',
      'release-superseded': 'Superseded',
    });
  });

  it('deduplicates the same release when a component is repeated in its payload', () => {
    const billingApi = buildComponent({
      id: 'component-billing',
      name: 'Billing API',
      version: '1.2.3',
    });

    const components = buildComponentCatalogRows(
      [billingApi],
      [
        buildRelease({
          components: [billingApi, billingApi],
          createdAt: '2026-03-01T10:00:00.000Z',
          createdBy: author,
          id: 'release-march',
          slug: 'release-2026-03',
          updatedAt: '2026-03-01T10:00:00.000Z',
          version: 'Release 2026.03',
        }),
      ],
    );

    expect(components).toHaveLength(1);
    expect(components[0].releaseCount).toBe(1);
    expect(components[0].releases).toHaveLength(1);
  });

  it('ignores releases without components and returns no rows for empty data', () => {
    const components = buildComponentCatalogRows(
      [],
      [
        buildRelease({
          components: null,
          createdAt: '2026-03-01T10:00:00.000Z',
          createdBy: author,
          id: 'release-empty',
          slug: 'release-empty',
          updatedAt: '2026-03-01T10:00:00.000Z',
          version: 'Release Empty',
        }),
      ],
    );

    expect(components).toEqual([]);
    expect(
      getComponentCatalogStats(groupComponentCatalogRows(components)),
    ).toEqual({
      releasesUsingComponents: 0,
      sharedAcrossReleases: 0,
      totalComponents: 0,
      versionedComponents: 0,
    });
  });

  const july = buildRelease({
    createdAt: '2026-07-01T10:00:00.000Z',
    id: 'release-july',
    slug: 'release-2026-7-0',
    version: '2026.7.0',
  });
  const august = buildRelease({
    createdAt: '2026-08-01T10:00:00.000Z',
    id: 'release-august',
    slug: 'release-2026-8-0',
    version: '2026.8.0',
  });

  const apiJuly = buildComponent({
    createdAt: '2026-07-01T09:00:00.000Z',
    id: 'component-api-2026-7-0',
    name: 'API',
    version: '2026.7.0',
  });
  const apiAugust = buildComponent({
    createdAt: '2026-08-01T09:00:00.000Z',
    description: 'Adds delivery tracking endpoints.',
    id: 'component-api-2026-8-0',
    name: 'API',
    version: '2026.8.0',
  });
  const supportCli = buildComponent({
    id: 'component-cli',
    name: 'Support CLI',
    version: '2.0.0',
  });

  // July ships API 2026.7.0 and the CLI; August ships both API versions.
  const catalogRows = () =>
    buildComponentCatalogRows(
      [supportCli, apiAugust, apiJuly],
      [
        { ...july, components: [apiJuly, supportCli] },
        { ...august, components: [apiJuly, apiAugust] },
      ],
    );

  it('groups versions by name, as the latest one with every release', () => {
    const groups = groupComponentCatalogRows(catalogRows());

    expect(groups.map((group) => group.name)).toEqual(['API', 'Support CLI']);
    expect(groups[0]).toMatchObject({
      description: 'Adds delivery tracking endpoints.',
      id: 'component-api-2026-8-0',
      releaseCount: 2,
      releases: [
        { id: 'release-july', version: '2026.7.0' },
        { id: 'release-august', version: '2026.8.0' },
      ],
      version: '2026.8.0',
    });
    expect(groups[0].versions.map((version) => version.version)).toEqual([
      '2026.8.0',
      '2026.7.0',
    ]);
    // Each version keeps its own releases.
    expect(groups[0].versions[0].releases.map((release) => release.id)).toEqual(
      ['release-august'],
    );
    expect(groups[1].versions).toHaveLength(1);
  });

  it('puts the highest version first, reading its numbers as numbers', () => {
    const [group] = groupComponentCatalogRows(
      ['1.9.0', '1.10.0', '1.2.0'].map((version) => ({
        ...buildComponent({ id: `api-${version}`, name: 'API', version }),
        releaseCount: 0,
        releases: [],
      })),
    );

    expect(group.version).toBe('1.10.0');
    expect(group.versions.map((version) => version.version)).toEqual([
      '1.10.0',
      '1.9.0',
      '1.2.0',
    ]);
  });

  it('breaks a version tie with the most recent creation', () => {
    const [group] = groupComponentCatalogRows(
      [
        { createdAt: '2026-01-01T10:00:00.000Z', id: 'older', version: 'V1' },
        { createdAt: '2026-02-01T10:00:00.000Z', id: 'newer', version: 'v1' },
      ].map((component) => ({
        ...buildComponent({ ...component, name: 'API' }),
        releaseCount: 0,
        releases: [],
      })),
    );

    expect(group.id).toBe('newer');
  });

  it('keys a component apart from its versions and expands only several', () => {
    const [api, supportCliGroup] = groupComponentCatalogRows(catalogRows());

    expect(getComponentCatalogEntryId(api)).toBe('component:API');
    expect(getComponentCatalogEntryId(api.versions[0])).toBe(
      'component-api-2026-8-0',
    );
    expect(getComponentCatalogEntryVersions(api)).toBe(api.versions);
    expect(getComponentCatalogEntryVersions(api.versions[0])).toBeUndefined();
    expect(getComponentCatalogEntryVersions(supportCliGroup)).toBeUndefined();
  });

  it('counts components, not versions, in the catalog stats', () => {
    expect(
      getComponentCatalogStats(groupComponentCatalogRows(catalogRows())),
    ).toEqual({
      releasesUsingComponents: 2,
      // API is in both releases; the CLI only in July.
      sharedAcrossReleases: 1,
      totalComponents: 2,
      versionedComponents: 1,
    });
  });
});

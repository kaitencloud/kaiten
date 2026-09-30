import { getReleaseOverviewStatus } from '@/domains/release-management';
import type {
  Component,
  ComponentCatalogEntry,
  ComponentCatalogGroup,
  ComponentCatalogRelease,
  ComponentCatalogRow,
  ComponentCatalogSourceRelease,
  ComponentCatalogStats,
} from '../types';

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  });

const sortReleases = (
  releases: ComponentCatalogRelease[],
): ComponentCatalogRelease[] =>
  [...releases].sort((left, right) => compareText(left.version, right.version));

const createCatalogRow = (component: Component): ComponentCatalogRow => ({
  ...component,
  releaseCount: 0,
  releases: [],
});

export const buildComponentCatalogRows = (
  components: Component[],
  releases: ComponentCatalogSourceRelease[],
): ComponentCatalogRow[] => {
  const componentsById = new Map<string, ComponentCatalogRow>(
    components.map((component) => [component.id, createCatalogRow(component)]),
  );

  for (const release of releases) {
    const releaseEntry: ComponentCatalogRelease = {
      createdAt: release.createdAt,
      id: release.id,
      slug: release.slug,
      status: getReleaseOverviewStatus(release),
      version: release.version,
    };

    for (const component of release.components ?? []) {
      const existingComponent =
        componentsById.get(component.id) ??
        createCatalogRow({
          createdAt: component.createdAt,
          createdBy: component.createdBy,
          description: component.description ?? undefined,
          id: component.id,
          name: component.name,
          previousComponentId: component.previousComponentId ?? undefined,
          slug: component.slug,
          version: component.version,
        });

      const alreadyLinkedToRelease = existingComponent.releases.some(
        (linkedRelease) => linkedRelease.id === release.id,
      );

      if (!alreadyLinkedToRelease) {
        existingComponent.releases = [
          ...existingComponent.releases,
          releaseEntry,
        ];
        existingComponent.releaseCount = existingComponent.releases.length;
      }

      componentsById.set(component.id, existingComponent);
    }
  }

  return [...componentsById.values()]
    .map((component) => ({
      ...component,
      releaseCount: component.releases.length,
      releases: sortReleases(component.releases),
    }))
    .sort((left, right) => {
      const nameComparison = compareText(left.name, right.name);

      if (nameComparison !== 0) {
        return nameComparison;
      }

      return compareText(left.version, right.version);
    });
};

// Versions are free-form. The numeric collation orders the usual dotted and
// dated schemes the way people read them (1.9.0 before 1.10.0, 2026.7.0 before
// 2026.8.0); the more recent creation breaks a tie.
const compareVersionsLatestFirst = (
  left: ComponentCatalogRow,
  right: ComponentCatalogRow,
) =>
  compareText(right.version, left.version) ||
  Date.parse(right.createdAt) - Date.parse(left.createdAt);

const mergeReleases = (
  versions: ComponentCatalogRow[],
): ComponentCatalogRelease[] =>
  sortReleases([
    ...new Map(
      versions.flatMap((version) =>
        version.releases.map((release) => [release.id, release] as const),
      ),
    ).values(),
  ]);

// The name is what makes versions one component: the API keeps each name and
// version pair unique within an organization.
export const groupComponentCatalogRows = (
  rows: ComponentCatalogRow[],
): ComponentCatalogGroup[] => {
  const versionsByName = new Map<string, ComponentCatalogRow[]>();

  for (const row of rows) {
    const versions = versionsByName.get(row.name);

    if (versions) {
      versions.push(row);
    } else {
      versionsByName.set(row.name, [row]);
    }
  }

  return [...versionsByName.values()]
    .map((versions) => {
      const sortedVersions = [...versions].sort(compareVersionsLatestFirst);
      const releases = mergeReleases(sortedVersions);

      return {
        ...sortedVersions[0],
        releaseCount: releases.length,
        releases,
        versions: sortedVersions,
      };
    })
    .sort((left, right) => compareText(left.name, right.name));
};

// A component's row carries its latest version's data, id included: keying it
// by name keeps it apart from that version's own row once expanded.
export const getComponentCatalogEntryId = (entry: ComponentCatalogEntry) =>
  entry.versions ? `component:${entry.name}` : entry.id;

// A single version is the component itself: there is nothing to expand.
export const getComponentCatalogEntryVersions = (
  entry: ComponentCatalogEntry,
) => (entry.versions && entry.versions.length > 1 ? entry.versions : undefined);

export const getComponentCatalogStats = (
  components: ComponentCatalogGroup[],
): ComponentCatalogStats => {
  const releaseIds = new Set<string>();

  for (const component of components) {
    for (const release of component.releases) {
      releaseIds.add(release.id);
    }
  }

  return {
    releasesUsingComponents: releaseIds.size,
    sharedAcrossReleases: components.filter(
      (component) => component.releaseCount > 1,
    ).length,
    totalComponents: components.length,
    versionedComponents: components.filter(
      (component) => component.versions.length > 1,
    ).length,
  };
};

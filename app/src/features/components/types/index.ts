import type { Component } from '@/api-client';
import type {
  ReleaseManagementOverviewComponent,
  ReleaseManagementOverviewRelease,
  ReleaseStatus,
} from '@/domains/release-management';

/** A release that ships a component, with the status it reads everywhere. */
export type ComponentCatalogRelease = Pick<
  ReleaseManagementOverviewRelease,
  'createdAt' | 'id' | 'slug' | 'version'
> & { status: ReleaseStatus };

/**
 * A release of the overview. Its deployment zones are what its status comes
 * from: the zones it ever reached, not only those that run it now.
 */
export type ComponentCatalogSourceRelease = Pick<
  ReleaseManagementOverviewRelease,
  'createdAt' | 'deploymentZones' | 'id' | 'slug' | 'version'
> & {
  components?: ReleaseManagementOverviewComponent[] | null;
};

/** A component version, with the releases that ship it. */
export type ComponentCatalogRow = Component & {
  releaseCount: number;
  releases: ComponentCatalogRelease[];
};

/**
 * A component: the versions sharing its name. It reads as its latest version,
 * with the releases of every version; `versions` holds them all, latest first.
 */
export type ComponentCatalogGroup = ComponentCatalogRow & {
  versions: ComponentCatalogRow[];
};

/**
 * A row of the catalog table: a component, or one of its versions once the
 * component is expanded.
 */
export type ComponentCatalogEntry = ComponentCatalogRow & {
  versions?: ComponentCatalogRow[];
};

export type { Component };

export type ComponentCatalogStats = {
  releasesUsingComponents: number;
  sharedAcrossReleases: number;
  totalComponents: number;
  versionedComponents: number;
};

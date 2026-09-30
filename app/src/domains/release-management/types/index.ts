import type { Release } from '@/api-client';
import type { GetReleaseManagementOverviewQuery } from '@/api-client/graphql/graphql';

export type { Release };

export type ReleaseManagementOverviewRelease = NonNullable<
  GetReleaseManagementOverviewQuery['releases']['items']
>[number];

export type ReleaseManagementOverviewComponent = NonNullable<
  ReleaseManagementOverviewRelease['components']
>[number];

export type ReleaseManagementOverviewDeploymentZone = NonNullable<
  ReleaseManagementOverviewRelease['deploymentZones']
>[number];

export type ReleaseManagementOverviewInstance = NonNullable<
  ReleaseManagementOverviewRelease['instances']
>[number];

export type DeploymentZoneRelatedRelease = Pick<
  ReleaseManagementOverviewRelease,
  'createdAt' | 'description' | 'id' | 'slug' | 'version'
>;

export type DeploymentZoneRelatedInstance = Pick<
  ReleaseManagementOverviewInstance,
  'deploymentZoneId' | 'description' | 'id' | 'name' | 'slug'
> & {
  customerName?: ReleaseManagementOverviewInstance['customer']['name'] | null;
};

export type DeploymentZoneRelations = {
  instances: DeploymentZoneRelatedInstance[];
  releases: DeploymentZoneRelatedRelease[];
};

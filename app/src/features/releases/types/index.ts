import type { Release } from '@/api-client';

export type {
  DeploymentZoneRelatedInstance,
  DeploymentZoneRelatedRelease,
  DeploymentZoneRelations,
  ReleaseManagementOverviewComponent,
  ReleaseManagementOverviewDeploymentZone,
  ReleaseManagementOverviewInstance,
  ReleaseManagementOverviewRelease,
} from '@/domains/release-management';

export type { Release };

export type ReleaseCreationMode = 'scratch' | 'existing';

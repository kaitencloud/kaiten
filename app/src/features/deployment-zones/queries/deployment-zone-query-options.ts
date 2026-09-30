import { getDeploymentZoneBySlugOptions } from '@/api-client/@tanstack/react-query.gen';
import { allDeploymentZonesOptions } from '@/lib/api/all-pages-query-options';

export const deploymentZonesQueryOptions = allDeploymentZonesOptions();

export const deploymentZoneQueryOptions = (deploymentZoneSlug: string) =>
  getDeploymentZoneBySlugOptions({
    path: { deploymentZoneSlug },
  });

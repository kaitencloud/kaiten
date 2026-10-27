import type { DeploymentZone, DeploymentZoneWritable } from '@/api-client';

/**
 * The update that restates a zone as it stands. The PUT replaces the zone, so
 * its name, its type, its description and its metadata are sent as they are. The
 * release is left out: the API records any release it receives as a deployment,
 * so a body that only restates the zone must not carry one, and deploying names
 * the release as the one thing it changes. The slug is left out too, which keeps
 * it. Another body for the same zone is compared with this one to tell what a
 * form changed: see `saveDeploymentZoneOnFresh`.
 */
export const deploymentZoneToUpdateBody = (
  zone: DeploymentZone,
): DeploymentZoneWritable => ({
  description: zone.description,
  metadata: zone.metadata,
  name: zone.name,
  type: zone.type,
});

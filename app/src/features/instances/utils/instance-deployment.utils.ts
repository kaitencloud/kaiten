import type { Instance, InstanceWritable } from '@/api-client';

/**
 * An instance can be created without a deployment zone. Attaching one for the
 * first time is a *deployment*; changing an existing one is a *migration*. The
 * API infers the distinction from the previous zone and emits either
 * INSTANCE_DEPLOYMENT or INSTANCE_MIGRATION, so the console only has to name
 * the action correctly.
 */
export type InstanceDeploymentMode = 'deploy' | 'migrate';

export const getInstanceDeploymentMode = (
  deploymentZoneId: string | null | undefined,
): InstanceDeploymentMode => (deploymentZoneId ? 'migrate' : 'deploy');

export const isInstanceDeployed = (
  deploymentZoneId: string | null | undefined,
): boolean => Boolean(deploymentZoneId);

/**
 * There is no dedicated deploy endpoint: moving an instance to a zone is a
 * PUT on the instance itself, and that PUT replaces the whole resource. Every
 * writable field is re-sent from the current instance so the zone change
 * cannot silently drop metadata or the license window.
 */
export const instanceToDeploymentUpdateInput = (
  instance: Instance,
  deploymentZoneId: string,
): InstanceWritable => ({
  customerId: instance.customerId,
  deploymentZoneId,
  description: instance.description,
  endLicenseDate: instance.endLicenseDate,
  licenseId: instance.licenseId,
  metadata: instance.metadata ?? {},
  name: instance.name,
  startLicenseDate: instance.startLicenseDate,
});

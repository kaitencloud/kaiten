import type { Instance, InstanceWritable } from '@/api-client';

/**
 * The update that restates an instance as it stands. The PUT replaces the
 * instance as a whole, so every writable member is sent back as it is, which keeps
 * a change of one from silently dropping the metadata or the license window. The
 * slug is left out, which keeps it, and so are the integrations, which the update
 * does not set. Another body for the same instance is compared with this one to
 * tell what a form changed: see `saveInstanceOnFresh`.
 */
export const instanceToUpdateBody = (instance: Instance): InstanceWritable => ({
  customerId: instance.customerId,
  deploymentZoneId: instance.deploymentZoneId,
  description: instance.description,
  endLicenseDate: instance.endLicenseDate,
  licenseId: instance.licenseId,
  metadata: instance.metadata ?? {},
  name: instance.name,
  startLicenseDate: instance.startLicenseDate,
});

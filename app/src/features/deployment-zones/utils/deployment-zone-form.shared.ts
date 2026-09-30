import type { DeploymentZoneWritable } from '@/api-client';
import type { DeploymentZoneFormValues } from '../schemas/deployment-zone.schema';

// The write body is built from the form's writable fields only. Deploying a
// release is its own flow (the deploy dialog) and the edit dialog has no
// release picker, so updates omit releaseId: the API treats any releaseId it
// receives as a deployment to record, and the edit form could only ever echo
// back the zone's current release. Updates omit the slug too -- the zone is
// identified by the slug in the path, and update rejects a slug that differs
// from it with a 422 (the API's DeploymentZone schema is shared across
// create/update/read, so this is enforced server-side rather than by a
// narrower update-only wire type).
export const deploymentZoneFormValuesToWriteBody = (
  values: DeploymentZoneFormValues,
  isEditing: boolean,
): DeploymentZoneWritable => {
  const trimmedSlug = values.slug?.trim();
  return {
    ...values,
    releaseId: isEditing ? undefined : (values.releaseId ?? undefined),
    // Left empty, omit it so the API generates the slug.
    slug: isEditing || !trimmedSlug ? undefined : trimmedSlug,
  };
};

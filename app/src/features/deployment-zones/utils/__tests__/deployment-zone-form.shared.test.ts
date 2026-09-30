import { describe, expect, it } from 'vite-plus/test';
import type { DeploymentZoneFormValues } from '../../schemas/deployment-zone.schema';
import { deploymentZoneFormValuesToWriteBody } from '../deployment-zone-form.shared';

const formValues: DeploymentZoneFormValues = {
  name: 'AWS eu-west-1',
  type: 'production',
  description: 'Primary production zone',
  metadata: { region: 'eu-west-1' },
  releaseId: 'release-1',
  slug: 'aws-eu-west-1',
};

describe('deploymentZoneFormValuesToWriteBody', () => {
  // The API treats any releaseId in the write body as a deployment to record,
  // and the edit dialog has no release picker: echoing the zone's current
  // release back on update would re-deploy it and collide with the existing
  // (zone, release) deployment row.
  it('omits releaseId when editing', () => {
    const body = deploymentZoneFormValuesToWriteBody(formValues, true);

    expect(body.releaseId).toBeUndefined();
  });

  it('keeps releaseId when creating', () => {
    const body = deploymentZoneFormValuesToWriteBody(formValues, false);

    expect(body.releaseId).toBe('release-1');
  });

  it('normalizes a null releaseId to undefined when creating', () => {
    const body = deploymentZoneFormValuesToWriteBody(
      { ...formValues, releaseId: null },
      false,
    );

    expect(body.releaseId).toBeUndefined();
  });

  it('keeps the other writable fields intact', () => {
    const body = deploymentZoneFormValuesToWriteBody(formValues, true);

    expect(body).toMatchObject({
      name: 'AWS eu-west-1',
      type: 'production',
      description: 'Primary production zone',
      metadata: { region: 'eu-west-1' },
    });
  });

  it('keeps the slug when creating', () => {
    const body = deploymentZoneFormValuesToWriteBody(formValues, false);

    expect(body.slug).toBe('aws-eu-west-1');
  });

  // Update rejects a slug that differs from the path's with a 422 (see
  // deploymentZoneFormValuesToWriteBody's doc comment), so omitting it here
  // is what keeps a no-op edit a no-op.
  it('omits the slug when editing', () => {
    const body = deploymentZoneFormValuesToWriteBody(formValues, true);

    expect(body.slug).toBeUndefined();
  });

  it('omits an empty slug so the API generates it', () => {
    const body = deploymentZoneFormValuesToWriteBody(
      { ...formValues, slug: '  ' },
      false,
    );

    expect(body.slug).toBeUndefined();
  });
});

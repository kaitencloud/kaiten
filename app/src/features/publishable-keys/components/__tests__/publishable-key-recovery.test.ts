import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { initialPublishableKeyFormValues } from '../../schemas';
import { publishableKeyRecovery } from '../form/publishable-key-recovery';

describe('the recovery descriptor of the issue of a publishable key', () => {
  it('pins the identity of what is stored, and keeps the Turnstile secret out of it', () => {
    expect(publishableKeyRecovery.formId).toBe('publishableKeys.create');
    expect(publishableKeyRecovery.version).toBe(1);
    // A secret is written to the API and read by nobody: never to the device.
    expect(publishableKeyRecovery.omit).toEqual(['turnstileSecret']);
    expect(publishableKeyRecovery.steps).toBeUndefined();
  });

  it('names every field of the form, for the notes of a restore', () => {
    expect(Object.keys(publishableKeyRecovery.fieldLabels ?? {}).sort()).toEqual(
      Object.keys(initialPublishableKeyFormValues).sort(),
    );
  });

  // The schema is built on the generated one of the API: a change of the contract
  // moves this snapshot, which is the cue to ask whether `version` must be raised,
  // since a stored input is read back through it.
  it('stores values of the shape its schema describes', () => {
    expect(
      z.toJSONSchema(publishableKeyRecovery.schema!, {
        io: 'input',
        unrepresentable: 'any',
      }),
    ).toMatchSnapshot();
  });
});

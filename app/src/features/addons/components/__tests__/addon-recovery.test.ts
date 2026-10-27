import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { initialAddonFormValues } from '../../schemas';
import { addonRecovery } from '../form/addon-recovery';

describe('the recovery descriptor of the add-on creation', () => {
  it('pins the identity of what is stored, and what is kept out of it', () => {
    expect(addonRecovery.formId).toBe('addons.create');
    expect(addonRecovery.version).toBe(1);
    // Nothing in the form is a secret, a code entered once or a person's data.
    expect(addonRecovery.omit).toEqual([]);
    expect(addonRecovery.steps).toBeUndefined();
  });

  it('names every field of the form, for the notes of a restore', () => {
    expect(Object.keys(addonRecovery.fieldLabels ?? {}).sort()).toEqual(
      Object.keys(initialAddonFormValues()).sort(),
    );
  });

  // The schema derives from the generated one of the API: a change of the contract
  // moves this snapshot, which is the cue to ask whether `version` must be raised,
  // since a stored input is read back through it.
  it('stores values of the shape its schema describes', () => {
    expect(
      z.toJSONSchema(addonRecovery.schema!, {
        io: 'input',
        unrepresentable: 'any',
      }),
    ).toMatchSnapshot();
  });
});

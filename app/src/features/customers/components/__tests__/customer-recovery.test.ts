import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { initialCustomerFormValues } from '../customer-form.shared';
import { customerRecovery } from '../customer-recovery';

describe('the recovery descriptor of the customer creation', () => {
  it('pins the identity of what is stored, and keeps the billing e-mail out of it', () => {
    expect(customerRecovery.formId).toBe('customers.create');
    expect(customerRecovery.version).toBe(1);
    // A person's address: no personal data reaches the device.
    expect(customerRecovery.omit).toEqual(['billingEmail']);
    expect(customerRecovery.steps).toBeUndefined();
  });

  it('names every field of the form, for the notes of a restore', () => {
    expect(Object.keys(customerRecovery.fieldLabels ?? {}).sort()).toEqual(
      Object.keys(initialCustomerFormValues).sort(),
    );
  });

  // The schema derives from the generated one of the API: a change of the contract
  // moves this snapshot, which is the cue to ask whether `version` must be raised,
  // since a stored input is read back through it.
  it('stores values of the shape its schema describes', () => {
    expect(
      z.toJSONSchema(customerRecovery.schema!, {
        io: 'input',
        unrepresentable: 'any',
      }),
    ).toMatchSnapshot();
  });
});

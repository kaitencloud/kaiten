import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { FORM_RECOVERY_DEFAULT_RETENTION_DAYS } from '@/lib/form-recovery';
import { entitlementRecovery } from '../entitlement-recovery';

describe('the recovery descriptor of the entitlement creation page', () => {
  it('pins the identity of what is stored, and what is kept out of it', () => {
    expect(entitlementRecovery.formId).toBe('entitlements.create');
    expect(entitlementRecovery.version).toBe(1);
    // Nothing in the form is a secret, a code entered once or a file.
    expect(entitlementRecovery.omit).toEqual([]);
    expect(entitlementRecovery.steps).toEqual(['identity', 'type']);
  });

  it('keeps an input for the default of seven days', () => {
    expect(entitlementRecovery.retentionDays).toBeUndefined();
    expect(FORM_RECOVERY_DEFAULT_RETENTION_DAYS).toBe(7);
  });

  // The schema derives from the generated one of the API: a change of the contract
  // moves this snapshot, which is the cue to ask whether `version` must be raised,
  // since a stored input is read back through it.
  it('stores values of the shape its schema describes', () => {
    const schema = entitlementRecovery.schema;

    expect(schema).toBeDefined();
    expect(
      z.toJSONSchema(schema!, { io: 'input', unrepresentable: 'any' }),
    ).toMatchSnapshot();
  });
});

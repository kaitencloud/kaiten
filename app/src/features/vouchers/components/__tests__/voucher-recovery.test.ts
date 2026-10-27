import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { initialVoucherFormValues } from '../../schemas';
import { voucherRecovery } from '../pages/voucher-recovery';

describe('the recovery descriptor of the voucher wizard', () => {
  it('pins the identity of what is stored, and keeps the code out of it', () => {
    expect(voucherRecovery.formId).toBe('vouchers.create');
    expect(voucherRecovery.version).toBe(2);
    // The glossary keeps a code out of every storage of the browser.
    expect(voucherRecovery.omit).toEqual(['code']);
    expect(voucherRecovery.ignore).toEqual(['grants[].key', 'flagGrants[].key']);
    expect(voucherRecovery.steps).toEqual(['type', 'offer', 'eligibility', 'review']);
  });

  it('puts every field on one step, the code on the eligibility', () => {
    const placed = Object.values(voucherRecovery.stepFields ?? {}).flat();

    expect([...placed].sort()).toEqual(Object.keys(initialVoucherFormValues).sort());
    expect(voucherRecovery.stepFields?.eligibility).toContain('code');
  });

  it('names every field of the form, for the notes of a restore', () => {
    expect(Object.keys(voucherRecovery.fieldLabels ?? {}).sort()).toEqual(
      Object.keys(initialVoucherFormValues).sort(),
    );
  });

  // The schema derives from the generated one of the API: a change of the contract
  // moves this snapshot, which is the cue to ask whether `version` must be raised,
  // since a stored input is read back through it.
  it('stores values of the shape its schema describes', () => {
    expect(
      z.toJSONSchema(voucherRecovery.schema!, { io: 'input', unrepresentable: 'any' }),
    ).toMatchSnapshot();
  });
});

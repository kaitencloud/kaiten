import { describe, expect, it } from 'vite-plus/test';
import {
  CANCEL_REASON_MAX_LENGTH,
  CANCEL_REFUSAL_FIELDS,
  cancelFormSchema,
  cancelValuesToBody,
  countReasonCharacters,
} from '../cancel-subscription.schema';
import { initialCancelFormValues } from '../cancel-form-options';

const parse = (values: Partial<typeof initialCancelFormValues>) =>
  cancelFormSchema.safeParse({ ...initialCancelFormValues, ...values });

describe('what the cancel dialog opens with', () => {
  it('waits for the end of the period, with no reason and nothing else asked for', () => {
    expect(initialCancelFormValues).toMatchObject({
      mode: 'AT_PERIOD_END',
      reason: '',
      removeAddons: false,
      setEndDate: false,
    });
    expect(parse({}).success).toBe(true);
  });
});

describe('the reason of a cancellation', () => {
  it('is counted in characters, the way the API counts it, and not in UTF-16 units', () => {
    expect(countReasonCharacters('abc')).toBe(3);
    // One character, two UTF-16 units.
    expect(countReasonCharacters('\u{1F600}')).toBe(1);
    expect(countReasonCharacters('  trimmed  ')).toBe(7);
  });

  it('may be as long as the API keeps, and no longer', () => {
    expect(parse({ reason: 'a'.repeat(CANCEL_REASON_MAX_LENGTH) }).success).toBe(true);
    expect(parse({ reason: 'a'.repeat(CANCEL_REASON_MAX_LENGTH + 1) }).success).toBe(false);
    // The same count in characters that take two units each is still within it.
    expect(parse({ reason: '\u{1F600}'.repeat(CANCEL_REASON_MAX_LENGTH) }).success).toBe(true);
  });

  it('is refused in the words of the form', () => {
    const result = parse({ reason: 'a'.repeat(CANCEL_REASON_MAX_LENGTH + 1) });

    expect(result.success ? [] : result.error.issues.map(({ message }) => message)).toEqual([
      'Pages.Customers.Instances.Detail.Billing.Cancel.Errors.reason',
    ]);
  });
});

describe('the end of the license set beside a cancellation', () => {
  it('needs a date as soon as it is asked for, and none before', () => {
    expect(parse({ endDate: '', setEndDate: false }).success).toBe(true);
    expect(parse({ endDate: '2027-04-01T00:00', setEndDate: true }).success).toBe(true);

    const result = parse({ endDate: '', setEndDate: true });

    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map(({ path }) => path.join('.'))).toEqual([
      'endDate',
    ]);
  });
});

describe('the body of a cancellation', () => {
  const values = { ...initialCancelFormValues, mode: 'IMMEDIATE' as const };

  it('carries the mode, and a reason without its margins', () => {
    expect(cancelValuesToBody({ ...values, reason: '  moved to another tool  ' }, { status: 'ACTIVE' })).toEqual(
      { mode: 'IMMEDIATE', reason: 'moved to another tool' },
    );
  });

  it('leaves out a reason that is empty, or only spaces', () => {
    expect(cancelValuesToBody({ ...values, reason: '   ' }, { status: 'ACTIVE' }).reason).toBeUndefined();
    expect(cancelValuesToBody(values, { status: 'PAST_DUE' }).reason).toBeUndefined();
  });

  it('is immediate for a trial, which ends at once whatever was asked', () => {
    expect(cancelValuesToBody({ ...values, mode: 'AT_PERIOD_END' }, { status: 'TRIAL' }).mode).toBe(
      'IMMEDIATE',
    );
    expect(cancelValuesToBody({ ...values, mode: 'AT_PERIOD_END' }, { status: 'ACTIVE' }).mode).toBe(
      'AT_PERIOD_END',
    );
  });

  it('is immediate for a checkout waiting for its payment, pending over a free subscription included', () => {
    expect(cancelValuesToBody({ ...values, mode: 'AT_PERIOD_END' }, { status: 'INCOMPLETE' }).mode).toBe(
      'IMMEDIATE',
    );
    expect(
      cancelValuesToBody(
        { ...values, mode: 'AT_PERIOD_END' },
        { pendingLicenseSlug: 'pro-v3', status: 'ACTIVE' },
      ).mode,
    ).toBe('IMMEDIATE');
  });

  it('sends nothing about the add-ons or the end of the license, which are requests of their own', () => {
    expect(
      Object.keys(
        cancelValuesToBody(
          { ...values, endDate: '2027-04-01T00:00', removeAddons: true, setEndDate: true },
          { status: 'ACTIVE' },
        ),
      ).sort(),
    ).toEqual(['mode', 'reason']);
  });
});

describe('where a refusal of the cancellation is shown', () => {
  it('puts the refusal of a reason that is too long on the reason, and no other', () => {
    expect(CANCEL_REFUSAL_FIELDS.byCode).toEqual({
      'CancelSubscription.InvalidReason': 'reason',
    });
  });
});

import { describe, expect, it } from 'vite-plus/test';
import { getCancellationReasonLabelKey } from '../logic';

describe('the reason of a cancellation', () => {
  it('has a translation for each code Kaiten writes itself', () => {
    expect(getCancellationReasonLabelKey('INCOMPLETE_EXPIRED')).toBe(
      'Features.Billing.CancellationReasons.INCOMPLETE_EXPIRED',
    );
    expect(
      getCancellationReasonLabelKey('TRIAL_ENDED_WITHOUT_PAYMENT_METHOD'),
    ).toBe(
      'Features.Billing.CancellationReasons.TRIAL_ENDED_WITHOUT_PAYMENT_METHOD',
    );
  });

  it('has none for a sentence a person wrote, or a code a later release writes: it is shown as it is', () => {
    expect(getCancellationReasonLabelKey('Moving to another vendor')).toBeUndefined();
    expect(getCancellationReasonLabelKey('SOMETHING_NEW')).toBeUndefined();
    expect(getCancellationReasonLabelKey('')).toBeUndefined();
  });

  it('is not fooled by the name of a property every object has', () => {
    expect(getCancellationReasonLabelKey('toString')).toBeUndefined();
    expect(getCancellationReasonLabelKey('constructor')).toBeUndefined();
    expect(getCancellationReasonLabelKey('__proto__')).toBeUndefined();
  });

  it('is case sensitive: the codes are stored as they are written', () => {
    expect(getCancellationReasonLabelKey('incomplete_expired')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vite-plus/test';
import {
  isWeakUnboundedCode,
  normalizeCode,
  WEAK_CODE_LENGTH,
} from '../voucher-code';

describe('the code of a voucher, as the API matches it', () => {
  it('drops everything but letters and digits and upper-cases the rest', () => {
    expect(normalizeCode('welcome-spring_2027')).toBe('WELCOMESPRING2027');
    expect(normalizeCode(' a b-c ')).toBe('ABC');
    expect(normalizeCode('')).toBe('');
  });
});

describe('a code that can be guessed', () => {
  const none = { expiresAt: '', maxRedemptions: Number.NaN };

  it('is a short code, by its normalized characters, with no maximum and no end', () => {
    expect(isWeakUnboundedCode({ ...none, code: 'SPRING2027' })).toBe(true);
    expect(isWeakUnboundedCode({ ...none, code: 'SPRING-2027' })).toBe(true);
    expect(
      isWeakUnboundedCode({ ...none, code: 'A'.repeat(WEAK_CODE_LENGTH - 1) }),
    ).toBe(true);
  });

  it('is not one that is long enough, whatever separators spread it over', () => {
    expect(
      isWeakUnboundedCode({ ...none, code: 'A'.repeat(WEAK_CODE_LENGTH) }),
    ).toBe(false);
    // Thirteen characters with hyphens are eleven once normalized, and the API counts those.
    expect(isWeakUnboundedCode({ ...none, code: 'ABCD-EFGH-IJK' })).toBe(true);
  });

  it('is not one that is bounded by a maximum or by an end date', () => {
    expect(
      isWeakUnboundedCode({ code: 'SPRING2027', expiresAt: '', maxRedemptions: 100 }),
    ).toBe(false);
    expect(
      isWeakUnboundedCode({
        code: 'SPRING2027',
        expiresAt: '2027-06-30T23:59',
        maxRedemptions: Number.NaN,
      }),
    ).toBe(false);
  });

  it('is not an empty code: the API generates a long one with eighty random bits', () => {
    expect(isWeakUnboundedCode({ ...none, code: '' })).toBe(false);
    expect(isWeakUnboundedCode({ ...none, code: '   ' })).toBe(false);
  });
});

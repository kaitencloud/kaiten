import { describe, expect, it } from 'vite-plus/test';

import {
  add,
  compare,
  divide,
  multiply,
  parseDecimal,
  round,
  sameDecimal,
  shift,
  subtract,
  toDecimalString,
} from '../decimal';

const d = (text: string) => {
  const value = parseDecimal(text);
  if (value === null) {
    throw new Error(`not a decimal: ${text}`);
  }

  return value;
};

describe('parseDecimal and toDecimalString', () => {
  it.each([
    ['0.0000000001', '0.0000000001'],
    ['0.1234567891', '0.1234567891'],
    ['0.000000000001', '0.000000000001'],
    ['12', '12'],
    ['1.500000', '1.5'],
    ['-0.25', '-0.25'],
    ['0.000', '0'],
    ['-0', '0'],
    ['123456789012345678901234567890.5', '123456789012345678901234567890.5'],
  ])('round-trips %s as %s', (text, want) => {
    expect(toDecimalString(d(text))).toBe(want);
  });

  it.each(['', ' 1', '1.', '.5', '1e-3', 'abc', '+1', '1,5'])('refuses %j', (text) => {
    expect(parseDecimal(text)).toBeNull();
  });

  it('reads null and undefined as null', () => {
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
  });
});

describe('arithmetic', () => {
  it('adds, subtracts and multiplies exactly where floats do not', () => {
    expect(toDecimalString(add(d('0.1'), d('0.2')))).toBe('0.3');
    expect(toDecimalString(subtract(d('1'), d('0.9')))).toBe('0.1');
    expect(toDecimalString(multiply(d('0.0004'), d('1240')))).toBe('0.496');
    expect(toDecimalString(multiply(d('0.000000000001'), d('9007199254740993')))).toBe('9007.199254740993');
  });

  it('shifts milliseconds to seconds exactly', () => {
    expect(toDecimalString(shift(d('1500'), -3))).toBe('1.5');
    expect(toDecimalString(shift(d('1.5'), 2))).toBe('150');
  });

  it('compares across scales', () => {
    expect(compare(d('1.380000'), d('1.38'))).toBe(0);
    expect(compare(d('0.5'), d('0.49999'))).toBe(1);
    expect(compare(d('-1'), d('0'))).toBe(-1);
    expect(sameDecimal('1.38', '1.380000')).toBe(true);
    expect(sameDecimal('1.38', null)).toBe(false);
  });
});

// Go's shopspring Round: half away from zero.
describe('round', () => {
  it.each([
    ['0.0000005', 6, '0.000001'],
    ['0.0000004999', 6, '0'],
    ['1.2345665', 6, '1.234567'],
    ['-1.2345665', 6, '-1.234567'],
    ['2.5', 0, '3'],
    ['-2.5', 0, '-3'],
    ['1.5', 6, '1.5'],
  ] as const)('rounds %s to %i places as %s', (text, places, want) => {
    expect(toDecimalString(round(d(text), places))).toBe(want);
  });
});

describe('divide', () => {
  it.each([
    ['0.012', '1.6', 12, '0.0075'],
    ['1', '3', 6, '0.333333'],
    ['2', '3', 6, '0.666667'],
    ['-2', '3', 6, '-0.666667'],
    ['1', '-8', 3, '-0.125'],
    ['0.000003', '0.0075', 10, '0.0004'],
  ] as const)('%s ÷ %s at %i places is %s', (numerator, divisor, places, want) => {
    const value = divide(d(numerator), d(divisor), places);

    expect(value && toDecimalString(value)).toBe(want);
  });

  it('returns null for a zero divisor', () => {
    expect(divide(d('1'), d('0.000'), 6)).toBeNull();
  });
});

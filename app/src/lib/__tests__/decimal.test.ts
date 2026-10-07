import { describe, expect, it } from 'vite-plus/test';
import {
  addDecimalStrings,
  floorDecimalAtZero,
  formatDecimalQuantity,
  isDecimalString,
} from '../decimal';

describe('addDecimalStrings', () => {
  it.each([
    ['60000', '50000', '110000'],
    ['0.1', '0.2', '0.3'],
    ['1.50', '2.5', '4'],
    ['-30000', '10000', '-20000'],
    ['0.52345', '0.47655', '1'],
    // Beyond 2^53: a float would round these.
    ['9007199254740993', '1', '9007199254740994'],
    ['0.000000000001', '0.000000000002', '0.000000000003'],
  ])('adds %s and %s exactly, to %s', (left, right, sum) => {
    expect(addDecimalStrings(left, right)).toBe(sum);
  });

  it('reads what is not a decimal as zero', () => {
    expect(addDecimalStrings('abc', '5')).toBe('5');
    expect(addDecimalStrings('', '')).toBe('0');
  });
});

describe('floorDecimalAtZero', () => {
  it.each([
    ['172345', '172345'],
    ['-0.5', '0'],
    ['0', '0'],
    ['12.50', '12.5'],
    ['nope', '0'],
  ])('floors %s at zero as %s', (text, floored) => {
    expect(floorDecimalAtZero(text)).toBe(floored);
  });
});

describe('formatDecimalQuantity', () => {
  it('groups the digits as the language does and keeps every decimal', () => {
    expect(formatDecimalQuantity('172345', 'en')).toBe('172,345');
    expect(formatDecimalQuantity('0.52345', 'en')).toBe('0.52345');
    expect(formatDecimalQuantity('1234567.5', 'en')).toBe('1,234,567.5');
    expect(formatDecimalQuantity('-1500', 'en')).toContain('1,500');
  });

  it('writes a number beyond 2^53 digit for digit', () => {
    expect(formatDecimalQuantity('9007199254740993', 'en')).toBe(
      '9,007,199,254,740,993',
    );
  });

  it('follows the language of the app', () => {
    // A French reader gets a narrow no-break space and a decimal comma.
    expect(formatDecimalQuantity('1234.5', 'fr')).toMatch(/^1\s234,5$/);
  });

  it('returns a text that is not a decimal as it came', () => {
    expect(formatDecimalQuantity('n/a', 'en')).toBe('n/a');
    expect(formatDecimalQuantity('1e5', 'en')).toBe('1e5');
  });
});

describe('isDecimalString', () => {
  it('tells a decimal from what is not one', () => {
    expect(isDecimalString('12.5')).toBe(true);
    expect(isDecimalString('-3')).toBe(true);
    expect(isDecimalString('1,5')).toBe(false);
    expect(isDecimalString('')).toBe(false);
  });
});

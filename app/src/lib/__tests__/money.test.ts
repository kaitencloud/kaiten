import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { logger } from '../logger';
import {
  formatMoney,
  formatUnitAmountDecimal,
  getCurrencyExponent,
  isValidMajorAmount,
  majorToMinorDecimal,
  minorToMajorDecimal,
} from '../money';

// Intl separates a currency code from its amount, and a French amount from its
// symbol, with a no-break space. Tests read it as the space it looks like.
const plain = (text: string) => text.replace(/[  ]/g, ' ');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatMoney', () => {
  it.each<[string, number, string, string]>([
    ['USD', 2900, 'en-US', '$29.00'],
    ['USD', 2900, 'fr-FR', '29,00 $US'],
    ['EUR', 480000, 'en-US', '€4,800.00'],
    ['JPY', 5000, 'en-US', '¥5,000'],
    ['KWD', 12345, 'en-US', 'KWD 12.345'],
    ['USD', 0, 'en-US', '$0.00'],
    ['USD', 5, 'en-US', '$0.05'],
    // The API counts two decimals for these, where the locale data of a browser
    // counts none: 150000 is one thousand five hundred, not a hundred and fifty
    // thousand.
    ['HUF', 150000, 'en-US', 'HUF 1,500.00'],
    ['COP', 150000, 'en-US', 'COP 1,500.00'],
    ['IDR', 150000, 'en-US', 'IDR 1,500.00'],
    ['IQD', 12345, 'en-US', 'IQD 12.345'],
    ['CLF', 12345, 'en-US', 'CLF 1.2345'],
    ['UYI', 5000, 'en-US', 'UYI 5,000'],
  ])('writes %s %i for %s as %s', (currency, minor, locale, expected) => {
    expect(plain(formatMoney(currency, minor, locale))).toBe(expected);
  });

  it('writes a negative amount with a true minus sign', () => {
    expect(formatMoney('USD', -580, 'en-US')).toBe('−$5.80');
    expect(plain(formatMoney('EUR', -580, 'fr-FR'))).toBe('−5,80 €');
  });

  it('keeps every digit of an amount a float would round', () => {
    expect(formatMoney('USD', 9007199254740991, 'en-US')).toBe(
      '$90,071,992,547,409.91',
    );
    expect(formatMoney('USD', 9007199254740993n, 'en-US')).toBe(
      '$90,071,992,547,409.93',
    );
  });

  it('falls back to two decimals and the code for a currency it does not know, and says so once', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    expect(plain(formatMoney('XTS', 1234, 'en-US'))).toBe('XTS 12.34');
    expect(plain(formatMoney('XTS', 1, 'en-US'))).toBe('XTS 0.01');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('shows what it cannot read as a currency beside the amount', () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});

    expect(plain(formatMoney('not a currency', 1234, 'en-US'))).toBe(
      'not a currency 12.34',
    );
  });
});

describe('getCurrencyExponent', () => {
  it.each([
    ['JPY', 0],
    ['EUR', 2],
    ['usd', 2],
    ['KWD', 3],
    ['BHD', 3],
    ['HUF', 2],
    ['IQD', 3],
    ['CLF', 4],
    ['UYW', 4],
    ['UYI', 0],
  ])('reads %s as %i decimals', (currency, exponent) => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    expect(getCurrencyExponent(currency)).toBe(exponent);
    // A code of the API's table is known, whatever the runtime's locale data says.
    expect(warn).not.toHaveBeenCalled();
  });

  it('counts two decimals for a code the table does not know, and says so once', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    expect(getCurrencyExponent('ZZZ')).toBe(2);
    expect(getCurrencyExponent('zzz')).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('formatUnitAmountDecimal', () => {
  it('trims trailing zeros and never rounds', () => {
    expect(formatUnitAmountDecimal('USD', '0.000200000000', 'en-US')).toBe(
      '$0.000002',
    );
    expect(formatUnitAmountDecimal('USD', '0.075', 'en-US')).toBe(
      '$0.00075',
    );
  });

  it('keeps the currency decimals a price that has none to spare', () => {
    expect(formatUnitAmountDecimal('USD', '150', 'en-US')).toBe('$1.50');
    expect(formatUnitAmountDecimal('USD', '800', 'en-US')).toBe('$8.00');
    expect(formatUnitAmountDecimal('JPY', '150', 'en-US')).toBe('¥150');
    expect(plain(formatUnitAmountDecimal('KWD', '1500', 'en-US'))).toBe(
      'KWD 1.500',
    );
  });

  it('shows a value it cannot read as it was sent', () => {
    expect(formatUnitAmountDecimal('USD', 'abc', 'en-US')).toBe('USD abc');
  });
});

describe('minorToMajorDecimal', () => {
  it.each<[string, string, string]>([
    ['150', 'USD', '1.50'],
    ['1', 'USD', '0.01'],
    ['0', 'USD', '0.00'],
    ['7.5', 'USD', '0.075'],
    ['0.0002', 'USD', '0.000002'],
    ['150', 'JPY', '150'],
    ['12345', 'KWD', '12.345'],
    ['150000', 'HUF', '1500.00'],
  ])('shifts %s of %s into %s', (minor, currency, major) => {
    expect(minorToMajorDecimal(minor, currency)).toBe(major);
  });

  it('refuses what is not a decimal', () => {
    expect(minorToMajorDecimal('-1', 'USD')).toBeNull();
    expect(minorToMajorDecimal('1e3', 'USD')).toBeNull();
    expect(minorToMajorDecimal('', 'USD')).toBeNull();
  });
});

describe('majorToMinorDecimal', () => {
  it.each<[string, string, string]>([
    ['1.50', 'USD', '150'],
    ['1.5', 'USD', '150'],
    ['12', 'USD', '1200'],
    ['0.075', 'USD', '7.5'],
    ['0.000002', 'USD', '0.0002'],
    ['12,5', 'USD', '1250'],
    ['.5', 'USD', '50'],
    ['12.', 'USD', '1200'],
    ['0', 'USD', '0'],
    ['150', 'JPY', '150'],
    ['1.5', 'KWD', '1500'],
    ['1500', 'HUF', '150000'],
  ])('sends %s of %s as %s', (major, currency, minor) => {
    expect(majorToMinorDecimal(major, currency)).toBe(minor);
  });

  it('accepts as many decimals as a price may have, and no more', () => {
    // USD: 2 decimals of the unit, then at most 12 below the minor unit.
    expect(majorToMinorDecimal('0.00000000000001', 'USD')).toBe(
      '0.000000000001',
    );
    expect(majorToMinorDecimal('0.000000000000001', 'USD')).toBeNull();
    expect(majorToMinorDecimal('0.000000000001', 'JPY')).toBe(
      '0.000000000001',
    );
    expect(majorToMinorDecimal('0.0000000000001', 'JPY')).toBeNull();
  });

  it.each(['', '.', 'abc', '-1', '1.2.3', '1e3', '$5', ' '])(
    'refuses %j',
    (input) => {
      expect(majorToMinorDecimal(input, 'USD')).toBeNull();
      expect(isValidMajorAmount(input, 'USD')).toBe(false);
    },
  );

  it('round-trips with the way a price is shown in a field', () => {
    for (const minor of ['150', '7.5', '0.0002', '1', '0']) {
      const major = minorToMajorDecimal(minor, 'USD');
      expect(major).not.toBeNull();
      expect(majorToMinorDecimal(major as string, 'USD')).toBe(minor);
    }
  });
});

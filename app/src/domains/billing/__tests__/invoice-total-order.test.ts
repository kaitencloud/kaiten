import { describe, expect, it } from 'vite-plus/test';
import { compareInvoiceTotals } from '../logic';

const total = (currency: string, amount: number) => ({
  currency,
  total: amount,
});

describe('the order of invoices by what they come to', () => {
  it('puts the smaller amount of a currency before the larger', () => {
    expect(
      compareInvoiceTotals(total('USD', 900), total('USD', 12900)),
    ).toBeLessThan(0);
    expect(
      compareInvoiceTotals(total('USD', 12900), total('USD', 900)),
    ).toBeGreaterThan(0);
    expect(compareInvoiceTotals(total('USD', 900), total('USD', 900))).toBe(0);
  });

  it('never compares an amount of one currency with an amount of another', () => {
    // 5,000 of JPY is five thousand yen and 5,000 of EUR is fifty euros: the numbers
    // say nothing about which is more, so the currencies decide, whatever the amounts.
    expect(
      compareInvoiceTotals(total('EUR', 5000000), total('JPY', 1)),
    ).toBeLessThan(0);
    expect(
      compareInvoiceTotals(total('JPY', 1), total('EUR', 5000000)),
    ).toBeGreaterThan(0);
  });

  it('sorts a mixed list by currency, and by amount within each', () => {
    const rows = [
      total('USD', 250000),
      total('JPY', 5000),
      total('USD', 900),
      total('EUR', 12000),
      total('JPY', 700),
    ];

    expect(
      [...rows]
        .sort(compareInvoiceTotals)
        .map((row) => `${row.currency} ${row.total}`),
    ).toEqual(['EUR 12000', 'JPY 700', 'JPY 5000', 'USD 900', 'USD 250000']);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { CURRENCY_EXPONENTS } from '../currency-exponents';

// The API counts money in the minor units of this table, so the console must
// read the very same one: a currency the two disagree on shows an amount a
// hundred or a thousand times off.
const API_TABLE = resolve(
  __dirname,
  '../../../../api/internal/infrastructure/billing/money/money.go',
);

function readApiExponents(): Map<string, number> {
  const source = readFileSync(API_TABLE, 'utf8');
  const start = source.indexOf('var exponents = map[string]int32{');
  expect(start, 'the exponents table of the API moved').toBeGreaterThan(-1);
  const table = source.slice(start, source.indexOf('\n}', start));

  return new Map(
    [...table.matchAll(/"([A-Z]{3})":\s*(\d+)/g)].map(
      ([, code, exponent]) => [code, Number(exponent)] as const,
    ),
  );
}

describe('the currency exponents', () => {
  it('are the ones of the API, currency by currency', () => {
    const api = readApiExponents();

    // A parse that finds nothing would pass the comparison below.
    expect(api.size).toBeGreaterThan(100);
    expect(Object.fromEntries(CURRENCY_EXPONENTS)).toEqual(
      Object.fromEntries(api),
    );
  });

  it('count a code once', () => {
    const codes = [...CURRENCY_EXPONENTS.keys()];

    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z]{3}$/.test(code))).toBe(true);
  });
});

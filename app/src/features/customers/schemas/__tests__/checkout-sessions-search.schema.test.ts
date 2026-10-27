import { describe, expect, it } from 'vite-plus/test';
import {
  readCheckoutSessionsSearch,
  statusOfParam,
  toInitialFilterValues,
} from '../checkout-sessions-search.schema';

describe('readCheckoutSessionsSearch', () => {
  it.each([
    ['open', 'OPEN'],
    ['awaiting_payment', 'AWAITING_PAYMENT'],
    ['completed', 'COMPLETED'],
    ['abandoned', 'ABANDONED'],
    ['expired', 'EXPIRED'],
  ] as const)('reads ?status=%s as the filter %s', (param, status) => {
    const search = readCheckoutSessionsSearch({ status: param });

    expect(search).toEqual({ status: param });
    expect(statusOfParam(search.status)).toBe(status);
    expect(toInitialFilterValues(search)).toEqual({ status });
  });

  it('reads the checkout the panel is open on', () => {
    expect(readCheckoutSessionsSearch({ session: ' cs-1 ' })).toEqual({
      session: 'cs-1',
    });
  });

  it.each([
    ['a status in the API’s own case', { status: 'EXPIRED' }],
    ['a status that is none', { status: 'nonsense' }],
    ['a status that is not text', { status: 3 }],
    ['an empty checkout', { session: '   ' }],
    ['a checkout that is not text', { session: { id: 'cs-1' } }],
  ])('drops %s, field by field', (_, search) => {
    expect(readCheckoutSessionsSearch(search)).toEqual({});
  });

  it('keeps the one that reads when the other does not', () => {
    expect(
      readCheckoutSessionsSearch({ session: 'cs-1', status: 'nonsense' }),
    ).toEqual({ session: 'cs-1' });
  });

  it('opens no filter for an address that names none', () => {
    expect(toInitialFilterValues({})).toEqual({});
    expect(toInitialFilterValues({ session: 'cs-1' })).toEqual({});
  });
});

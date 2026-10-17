import { describe, expect, it } from 'vite-plus/test';
import { readEntitlementsSearch } from '../entitlements-search.schema';

describe('readEntitlementsSearch', () => {
  it('leaves nothing for a bare path', () => {
    expect(readEntitlementsSearch({})).toEqual({});
  });

  it('keeps the entitlement whose history is open, and the period it is read for', () => {
    expect(
      readEntitlementsSearch({
        from: '2027-03-01T00:00:00.000Z',
        history: 'api-calls',
        to: '2027-04-01T00:00:00.000Z',
      }),
    ).toEqual({
      from: '2027-03-01T00:00:00.000Z',
      history: 'api-calls',
      to: '2027-04-01T00:00:00.000Z',
    });
  });

  it('keeps an open end open', () => {
    expect(
      readEntitlementsSearch({
        from: '2027-03-01T00:00:00.000Z',
        history: 'api-calls',
      }),
    ).toEqual({ from: '2027-03-01T00:00:00.000Z', history: 'api-calls' });
  });

  it('drops a period that is not an instant, field by field, and opens the history with the rest', () => {
    expect(
      readEntitlementsSearch({
        from: 'last week',
        history: 'api-calls',
        to: '2027-04-01T00:00:00.000Z',
      }),
    ).toEqual({ history: 'api-calls', to: '2027-04-01T00:00:00.000Z' });
  });

  it('drops what is not a text where a text is expected, and what it does not know', () => {
    expect(
      readEntitlementsSearch({ history: 12, mode: 'configure', page: '2' }),
    ).toEqual({});
  });
});

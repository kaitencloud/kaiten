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

  it('keeps the resource the history is narrowed to, and the entitlement whose resources are listed', () => {
    expect(
      readEntitlementsSearch({ history: 'sources', resource: 'stigg' }),
    ).toEqual({ history: 'sources', resource: 'stigg' });
    expect(readEntitlementsSearch({ resources: 'sources' })).toEqual({
      resources: 'sources',
    });
  });

  it('drops a resource that is no key of the API, and a list that names no entitlement', () => {
    expect(
      readEntitlementsSearch({
        history: 'sources',
        resource: 'x'.repeat(129),
        resources: 7,
      }),
    ).toEqual({ history: 'sources' });
    expect(readEntitlementsSearch({ resource: 12 })).toEqual({});
  });

  it('drops what is not a text where a text is expected, and what it does not know', () => {
    expect(
      readEntitlementsSearch({ history: 12, mode: 'configure', page: '2' }),
    ).toEqual({});
  });
});

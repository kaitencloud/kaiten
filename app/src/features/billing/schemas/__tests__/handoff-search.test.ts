import { describe, expect, it } from 'vite-plus/test';
import {
  DEFAULT_HANDOFF_STATUS,
  handoffStatusOf,
  readHandoffSearch,
  toHandoffSearch,
} from '../handoff-search.schema';

describe('the search of the page of the queue', () => {
  it('reads the part of the queue a link asks for', () => {
    expect(readHandoffSearch({ status: 'ACKNOWLEDGED' })).toEqual({
      status: 'ACKNOWLEDGED',
    });
    expect(readHandoffSearch({ status: 'PENDING' })).toEqual({
      status: 'PENDING',
    });
  });

  it('drops what is not a status, and opens on what waits', () => {
    for (const search of [
      {},
      { status: 'DONE' },
      { status: 3 },
      { status: ['PENDING'] },
      { status: null },
    ]) {
      const read = readHandoffSearch(search);

      expect(read.status, JSON.stringify(search)).toBeUndefined();
      expect(handoffStatusOf(read)).toBe(DEFAULT_HANDOFF_STATUS);
    }
  });

  it('keeps nothing else a link carries', () => {
    expect(readHandoffSearch({ status: 'PENDING', utm: 'x' })).toEqual({
      status: 'PENDING',
    });
  });

  it('writes the part of the queue to the URL, and leaves the bare path for what waits', () => {
    expect(toHandoffSearch('ACKNOWLEDGED')).toEqual({ status: 'ACKNOWLEDGED' });
    expect(toHandoffSearch('PENDING')).toEqual({ status: undefined });
  });

  it('reads what it writes', () => {
    for (const status of ['PENDING', 'ACKNOWLEDGED'] as const) {
      expect(handoffStatusOf(readHandoffSearch(toHandoffSearch(status)))).toBe(
        status,
      );
    }
  });
});

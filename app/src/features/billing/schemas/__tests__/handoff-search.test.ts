import { describe, expect, it } from 'vite-plus/test';
import {
  DEFAULT_HANDOFF_STATUS,
  handoffStatusOf,
  readHandoffSearch,
} from '../handoff-search.schema';

describe('the search of the handoff view', () => {
  it('reads the part of the queue a link asks for', () => {
    expect(readHandoffSearch({ queue: 'ACKNOWLEDGED' })).toEqual({
      queue: 'ACKNOWLEDGED',
    });
    expect(readHandoffSearch({ queue: 'PENDING' })).toEqual({
      queue: 'PENDING',
    });
  });

  it('drops what is not a status, and opens on what waits', () => {
    for (const search of [
      {},
      { queue: 'DONE' },
      { queue: 'NOT_REQUIRED' },
      { queue: 3 },
      { queue: ['PENDING'] },
      { queue: null },
    ]) {
      const read = readHandoffSearch(search);

      expect(read.queue, JSON.stringify(search)).toBeUndefined();
      expect(handoffStatusOf(read)).toBe(DEFAULT_HANDOFF_STATUS);
    }
  });

  it('does not read the status of an invoice as the part of the queue', () => {
    expect(readHandoffSearch({ status: 'ACKNOWLEDGED' })).toEqual({});
  });

  it('keeps nothing else a link carries', () => {
    expect(readHandoffSearch({ queue: 'PENDING', utm: 'x' })).toEqual({
      queue: 'PENDING',
    });
  });
});

import { describe, expect, it } from 'vite-plus/test';
import {
  getEarlierKnownAttempt,
  getNewestKnownAttempt,
} from '../delivery-watch-attempts';

const first = { id: 'atmpt_1', timestamp: '2026-11-26T09:00:00Z' };
const second = { id: 'atmpt_2', timestamp: '2026-11-26T10:00:00Z' };

describe('getEarlierKnownAttempt', () => {
  it('keeps the older of two known attempts, whichever comes first', () => {
    expect(getEarlierKnownAttempt(first, second)).toBe(first);
    expect(getEarlierKnownAttempt(second, first)).toBe(first);
  });

  it('knows no attempt when either side knew none, from which every attempt counts', () => {
    expect(getEarlierKnownAttempt(undefined, second)).toBeUndefined();
    expect(getEarlierKnownAttempt(first, undefined)).toBeUndefined();
    expect(getEarlierKnownAttempt(undefined, undefined)).toBeUndefined();
  });
});

describe('getNewestKnownAttempt', () => {
  it('keeps the newest by order, with its id and time only', () => {
    expect(
      getNewestKnownAttempt([
        first,
        undefined,
        { ...second, status: 'success' } as typeof second,
      ]),
    ).toEqual(second);
  });

  it('knows no attempt when none is given', () => {
    expect(getNewestKnownAttempt([])).toBeUndefined();
    expect(getNewestKnownAttempt([undefined])).toBeUndefined();
  });
});

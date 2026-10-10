import { describe, expect, it } from 'vite-plus/test';
import type { UsageReport } from '@/api-client';
import { getLimitChangeSeqs } from '../logic/usage-reports';

const MARCH = {
  windowEnd: '2027-04-01T00:00:00.000Z',
  windowStart: '2027-03-01T00:00:00.000Z',
};
const APRIL = {
  windowEnd: '2027-05-01T00:00:00.000Z',
  windowStart: '2027-04-01T00:00:00.000Z',
};

const report = (
  seq: number,
  overrides: Partial<UsageReport> = {},
): UsageReport => ({
  aggregationMethod: 'sum',
  behavior: 'append',
  delta: '10',
  entitlementId: 'ent-1',
  eventCountAfter: seq,
  instanceId: 'ins-1',
  licenseId: 'lic-1',
  limitValue: '100',
  overageDelta: '0',
  reportSeq: seq,
  reportedAt: '2027-03-02T00:00:00.000Z',
  reportedValue: '10',
  valueAfter: String(seq * 10),
  valueBefore: String((seq - 1) * 10),
  ...MARCH,
  ...overrides,
});

describe('finding where the limit in force changed', () => {
  it('flags the report whose limit differs from the one before it in the same window', () => {
    expect(
      [
        ...getLimitChangeSeqs([
          report(1, { limitValue: '100' }),
          report(2, { limitValue: '100' }),
          report(3, { limitValue: '150' }),
          report(4, { limitValue: '150' }),
        ]),
      ],
    ).toEqual([3]);
  });

  it('does not flag the first report of a window: its window is what changed', () => {
    expect(
      getLimitChangeSeqs([
        report(1, { limitValue: '100' }),
        report(2, { limitValue: '200', ...APRIL }),
      ]).size,
    ).toBe(0);
  });

  it('flags a limit that was lifted, and one that was set', () => {
    expect(
      [
        ...getLimitChangeSeqs([
          report(1, { limitValue: '100' }),
          report(2, { limitValue: undefined }),
          report(3, { limitValue: '100' }),
        ]),
      ],
    ).toEqual([2, 3]);
  });

  it('reads no limit the same whether it is absent or null', () => {
    expect(
      getLimitChangeSeqs([
        report(1, { limitValue: undefined }),
        report(2, { limitValue: null as unknown as undefined }),
      ]).size,
    ).toBe(0);
  });
});

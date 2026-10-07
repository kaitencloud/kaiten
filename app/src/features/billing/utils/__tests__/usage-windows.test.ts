import { describe, expect, it } from 'vite-plus/test';
import type { UsageReport } from '@/api-client';
import { groupReportsByWindow } from '../usage-windows';

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

describe('grouping the reports of a line by the window they counted in', () => {
  it('gives one group per window, in the order the windows were first reported', () => {
    const windows = groupReportsByWindow([
      report(1),
      report(2),
      report(3, APRIL),
      report(4, APRIL),
    ]);

    expect(windows.map((window) => window.start)).toEqual([
      MARCH.windowStart,
      APRIL.windowStart,
    ]);
    expect(windows.map((window) => window.reports.map((r) => r.reportSeq))).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('sums what the reports of a window move the usage and the overage by', () => {
    const [window] = groupReportsByWindow([
      report(1, { delta: '38000', overageDelta: '0' }),
      report(2, { delta: '12200', overageDelta: '4200' }),
    ]);

    expect(window.sumDelta).toBe('50200');
    expect(window.sumOverageDelta).toBe('4200');
  });

  it('adds decimals digit for digit', () => {
    const [window] = groupReportsByWindow([
      report(1, { delta: '0.1' }),
      report(2, { delta: '0.2' }),
    ]);

    expect(window.sumDelta).toBe('0.3');
  });

  it('keeps every digit of a sum beyond what a float holds', () => {
    const [window] = groupReportsByWindow([
      report(1, { delta: '9007199254740992' }),
      report(2, { delta: '1' }),
    ]);

    expect(window.sumDelta).toBe('9007199254740993');
  });

  it('floors a window whose net movement is negative at zero, as the invoice does', () => {
    const [window] = groupReportsByWindow([
      report(1, { delta: '30' }),
      report(2, { behavior: 'set', delta: '-50' }),
    ]);

    expect(window.sumDelta).toBe('0');
  });

  it('floors each window apart: a negative one does not eat into the next', () => {
    const [march, april] = groupReportsByWindow([
      report(1, { delta: '-20' }),
      report(2, { delta: '15', ...APRIL }),
    ]);

    expect(march.sumDelta).toBe('0');
    expect(april.sumDelta).toBe('15');
  });

  it('groups the reports of an entitlement that never resets, which have no window, as one', () => {
    const windows = groupReportsByWindow([
      report(1, { windowEnd: undefined, windowStart: undefined }),
      report(2, { windowEnd: undefined, windowStart: undefined }),
    ]);

    expect(windows).toHaveLength(1);
    expect(windows[0].start).toBeUndefined();
    expect(windows[0].end).toBeUndefined();
  });

  it('has no group for no report', () => {
    expect(groupReportsByWindow([])).toEqual([]);
  });
});

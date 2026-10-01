import { describe, expect, it } from 'vite-plus/test';
import {
  getUsageStatus,
  getUsageStatusTone,
  isUsageAtRisk,
} from '../entitlement-usage-status';

describe('getUsageStatus', () => {
  it('bands usage against a hard limit', () => {
    expect(getUsageStatus(10, 100)).toBe('HEALTHY');
    expect(getUsageStatus(50, 100)).toBe('WATCH');
    expect(getUsageStatus(80, 100)).toBe('NEAR_LIMIT');
    expect(getUsageStatus(99, 100)).toBe('NEAR_LIMIT');
    // The API accepts a report that lands exactly on the ceiling and rejects
    // the next one: the grant is spent there, and breached past it.
    expect(getUsageStatus(100, 100)).toBe('AT_LIMIT');
    expect(getUsageStatus(101, 100)).toBe('OVER_LIMIT');
  });

  // A soft limit still has room at the granted value, so the page must not
  // call it spent while the API keeps accepting reports.
  it('bands usage under the grant against the stretched ceiling of a soft limit', () => {
    expect(getUsageStatus(100, 100, 25)).toBe('NEAR_LIMIT');
    expect(getUsageStatus(70, 100, 25)).toBe('WATCH');
    // 60 of a granted 100 is WATCH under a hard limit, and healthy once the
    // grant allows 125.
    expect(getUsageStatus(60, 100)).toBe('WATCH');
    expect(getUsageStatus(60, 100, 25)).toBe('HEALTHY');
  });

  it('names usage past the grant but under the wall an allowance, whatever the saturation', () => {
    expect(getUsageStatus(101, 100, 25)).toBe('IN_ALLOWANCE');
    expect(getUsageStatus(124, 100, 25)).toBe('IN_ALLOWANCE');
    // The wall itself is still accepted, and spends the allowance.
    expect(getUsageStatus(125, 100, 25)).toBe('AT_LIMIT');
    expect(getUsageStatus(126, 100, 25)).toBe('OVER_LIMIT');
    // A wide allowance can leave the saturation in the watch band; the grant
    // is spent all the same.
    expect(getUsageStatus(105, 100, 50)).toBe('IN_ALLOWANCE');
    // A hard limit has no allowance to be in.
    expect(getUsageStatus(101, 100)).toBe('OVER_LIMIT');
    expect(getUsageStatus(101, 100, 0)).toBe('OVER_LIMIT');
  });

  it('reports no bound for an unlimited or unset grant', () => {
    expect(getUsageStatus(1000, -1, -1)).toBe('UNBOUNDED');
    expect(getUsageStatus(1000, null)).toBe('UNBOUNDED');
  });

  it('reports any usage on a grant of nothing as over its limit', () => {
    // Spent before the first report: there was nothing to spend.
    expect(getUsageStatus(0, 0)).toBe('AT_LIMIT');
    expect(getUsageStatus(1, 0)).toBe('OVER_LIMIT');
    expect(getUsageStatus(1, 0, 20)).toBe('OVER_LIMIT');
  });
});

describe('isUsageAtRisk', () => {
  it('flags the states that call for a look', () => {
    expect(isUsageAtRisk('NEAR_LIMIT')).toBe(true);
    expect(isUsageAtRisk('IN_ALLOWANCE')).toBe(true);
    expect(isUsageAtRisk('AT_LIMIT')).toBe(true);
    expect(isUsageAtRisk('OVER_LIMIT')).toBe(true);
    expect(isUsageAtRisk('WATCH')).toBe(false);
    expect(isUsageAtRisk('HEALTHY')).toBe(false);
    expect(isUsageAtRisk('UNBOUNDED')).toBe(false);
  });
});

describe('getUsageStatusTone', () => {
  it('gives the fill and the text the same reading', () => {
    expect(getUsageStatusTone('OVER_LIMIT')).toEqual({
      fill: 'bg-destructive',
      text: 'text-destructive-subtle-foreground',
    });
    expect(getUsageStatusTone('AT_LIMIT')).toEqual(
      getUsageStatusTone('OVER_LIMIT'),
    );
    expect(getUsageStatusTone('IN_ALLOWANCE').fill).toBe('bg-warning');
    expect(getUsageStatusTone('NEAR_LIMIT').fill).toBe('bg-warning');
    expect(getUsageStatusTone('WATCH').fill).toBe('bg-success');
    expect(getUsageStatusTone('HEALTHY').text).toBe(
      'text-success-subtle-foreground',
    );
  });
});

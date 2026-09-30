import { describe, expect, it } from 'vite-plus/test';
import type { LicenseEntitlement } from '@/api-client';
import {
  getHighestAcceptedUsage,
  getLicenseEntitlementOveragePercent,
  getMaximumAllowedUsage,
  getUsagePercentage,
  getUsageRatio,
  isHardLimit,
  isSoftLimit,
  isUnlimitedThreshold,
  resolveLimitCapExceededOveragePercent,
} from '../entitlement-enforcement';

const grant = (
  value: unknown,
  type = 'number',
  limitCapExceededOveragePercent?: number,
): LicenseEntitlement =>
  ({
    limitCapExceededOveragePercent,
    value: { type, value },
  }) as LicenseEntitlement;

describe('isUnlimitedThreshold', () => {
  it('reads the sentinel and the absence of a value as uncapped', () => {
    expect(isUnlimitedThreshold(-1)).toBe(true);
    expect(isUnlimitedThreshold(null)).toBe(true);
    expect(isUnlimitedThreshold(undefined)).toBe(true);
  });

  it('reads any granted value, zero included, as capped', () => {
    expect(isUnlimitedThreshold(0)).toBe(false);
    expect(isUnlimitedThreshold(100)).toBe(false);
  });
});

describe('resolveLimitCapExceededOveragePercent', () => {
  it('forces the unlimited sentinel on an uncapped grant', () => {
    expect(resolveLimitCapExceededOveragePercent(-1, 10)).toBe(-1);
    expect(resolveLimitCapExceededOveragePercent(null, 0)).toBe(-1);
  });

  it('defaults a capped grant to a hard limit', () => {
    expect(resolveLimitCapExceededOveragePercent(100)).toBe(0);
    expect(resolveLimitCapExceededOveragePercent(100, null)).toBe(0);
  });

  it('rejects a percentage the API would not store', () => {
    expect(resolveLimitCapExceededOveragePercent(100, -1)).toBe(0);
    expect(resolveLimitCapExceededOveragePercent(100, 2.5)).toBe(0);
  });

  it('keeps a valid percentage', () => {
    expect(resolveLimitCapExceededOveragePercent(100, 0)).toBe(0);
    expect(resolveLimitCapExceededOveragePercent(100, 15)).toBe(15);
  });
});

describe('getLicenseEntitlementOveragePercent', () => {
  it('reads the stored percentage of a numeric grant', () => {
    expect(getLicenseEntitlementOveragePercent(grant(100, 'number', 25))).toBe(
      25,
    );
  });

  it('defaults a grant written before the field existed', () => {
    expect(getLicenseEntitlementOveragePercent(grant(100))).toBe(0);
    expect(getLicenseEntitlementOveragePercent(grant(-1))).toBe(-1);
  });

  it('normalises a stored percentage the value contradicts', () => {
    expect(getLicenseEntitlementOveragePercent(grant(-1, 'number', 25))).toBe(
      -1,
    );
  });

  it('has nothing to report for a non-numeric grant', () => {
    expect(getLicenseEntitlementOveragePercent(grant(true, 'boolean'))).toBeNull();
    expect(getLicenseEntitlementOveragePercent(grant({}, 'object'))).toBeNull();
  });
});

describe('isHardLimit / isSoftLimit', () => {
  it('separates the two kinds of cap', () => {
    expect(isHardLimit(100, 0)).toBe(true);
    expect(isSoftLimit(100, 0)).toBe(false);
    expect(isHardLimit(100, 20)).toBe(false);
    expect(isSoftLimit(100, 20)).toBe(true);
  });

  it('calls an uncapped grant neither', () => {
    expect(isHardLimit(-1, -1)).toBe(false);
    expect(isSoftLimit(-1, -1)).toBe(false);
    expect(isHardLimit(null)).toBe(false);
    expect(isSoftLimit(null)).toBe(false);
  });
});

describe('getMaximumAllowedUsage', () => {
  it('stretches the ceiling by the overage percentage', () => {
    expect(getMaximumAllowedUsage(100, 20)).toBe(120);
    expect(getMaximumAllowedUsage(1000, 5)).toBe(1050);
  });

  it('keeps the ceiling at the granted value for a hard limit', () => {
    expect(getMaximumAllowedUsage(100, 0)).toBe(100);
    expect(getMaximumAllowedUsage(100)).toBe(100);
  });

  it('treats a grant of nothing as a real ceiling of nothing', () => {
    expect(getMaximumAllowedUsage(0, 0)).toBe(0);
    expect(getMaximumAllowedUsage(0, 25)).toBe(0);
  });

  it('has no ceiling for an uncapped or nonsensical grant', () => {
    expect(getMaximumAllowedUsage(-1, -1)).toBeNull();
    expect(getMaximumAllowedUsage(null, null)).toBeNull();
    expect(getMaximumAllowedUsage(-5)).toBeNull();
  });
});

describe('getHighestAcceptedUsage', () => {
  it('drops the fraction a percentage of a granted value leaves behind', () => {
    // 999 + 53% is 1528.47, and the API rejects above it, so 1528 is the last
    // usage it takes.
    expect(getHighestAcceptedUsage(999, 53)).toBe(1528);
    expect(getHighestAcceptedUsage(3, 50)).toBe(4);
  });

  it('leaves a whole ceiling alone', () => {
    expect(getHighestAcceptedUsage(1000, 31)).toBe(1310);
    expect(getHighestAcceptedUsage(100, 0)).toBe(100);
    expect(getHighestAcceptedUsage(0, 0)).toBe(0);
  });

  it('has nothing to accept up to when nothing caps the grant', () => {
    expect(getHighestAcceptedUsage(-1, -1)).toBeNull();
    expect(getHighestAcceptedUsage(null)).toBeNull();
  });
});

describe('getUsageRatio', () => {
  it('measures against the stretched ceiling and keeps going past it', () => {
    expect(getUsageRatio(60, 100, 20)).toBe(0.5);
    expect(getUsageRatio(120, 100, 20)).toBe(1);
    expect(getUsageRatio(240, 100, 20)).toBe(2);
  });

  it('has no ratio when nothing caps the grant', () => {
    expect(getUsageRatio(1000, -1)).toBeNull();
    expect(getUsageRatio(1000, null)).toBeNull();
  });

  it('has no finite saturation for usage on a grant of nothing', () => {
    expect(getUsageRatio(0, 0)).toBe(1);
    expect(getUsageRatio(5, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('getUsagePercentage', () => {
  it('measures against the stretched ceiling', () => {
    expect(getUsagePercentage(100, 100, 20)).toBe(83);
    expect(getUsagePercentage(120, 100, 20)).toBe(100);
  });

  it('measures a hard limit against the granted value', () => {
    expect(getUsagePercentage(100, 100, 0)).toBe(100);
    expect(getUsagePercentage(100, 100)).toBe(100);
  });

  it('never runs past full', () => {
    expect(getUsagePercentage(1000, 100, 20)).toBe(100);
  });

  it('draws nothing when nothing caps the grant', () => {
    expect(getUsagePercentage(1000, -1)).toBe(0);
    expect(getUsagePercentage(1000, null)).toBe(0);
  });

  it('reads full for a grant of nothing', () => {
    expect(getUsagePercentage(0, 0)).toBe(100);
    expect(getUsagePercentage(5, 0)).toBe(100);
  });
});

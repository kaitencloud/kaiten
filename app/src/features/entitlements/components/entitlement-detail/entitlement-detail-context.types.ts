import type { Entitlement, License, LicenseEntitlement } from '@/api-client';
import {
  isUnlimitedThreshold,
  type UsageStatus,
} from '@/domains/entitlement-usage';

export type { UsageStatus };

export type BucketKey =
  | 'under50'
  | 'between50and80'
  | 'between80and100'
  | 'over100'
  | 'unbounded';

export type LinkedLicenseMapping = {
  license: License & { slug: string };
  mapping: LicenseEntitlement;
};

export type EnrichedUsage = {
  // Bounds of the window this instance's value belongs to; absent for a
  // lifetime counter. Per-instance because a LICENSE_START anchor phases the
  // window off each instance's own license start date.
  currentPeriodEnd?: string;
  currentPeriodStart?: string;
  customerId: string;
  customerName: string;
  instanceName: string;
  instanceSlug: string;
  licenseName: string;
  licenseSlug: string;
  licenseType: License['type'];
  // The allowance the saturation is measured against: usage may run past
  // `threshold` by this percentage before the API rejects it.
  limitCapExceededOveragePercent: number | null;
  ratio: number | null;
  status: UsageStatus;
  threshold: number | null;
  value: number;
};

export type LicenseAggregate = {
  enabled?: boolean;
  instances: number;
  licenseName: string;
  licenseSlug: string;
  licenseType: License['type'];
  maxRatio: number | null;
  nearLimitCount: number;
  overLimitCount: number;
  threshold: number | null;
  totalUsage: number;
  updatedAt: string;
  version: string;
};

export type CustomerAggregate = {
  customerId: string;
  customerName: string;
  customerSlug?: string;
  impactedInstances: number;
  maxRatio: number | null;
  mostExposedLicense: string;
  nearLimitCount: number;
  overLimitCount: number;
};

export type EntitlementDetailContextValue = {
  atRiskInstances: EnrichedUsage[];
  customerAggregates: CustomerAggregate[];
  entitlement: Entitlement;
  entitlementSlug?: string;
  isLoading: boolean;
  isUsageLoading: boolean;
  licenseAggregates: LicenseAggregate[];
  linkedLicenseMappings: LinkedLicenseMapping[];
  metrics: {
    atRiskInstances: number;
    impactedCustomers: number;
    impactedInstances: number;
    limitedMappings: number;
    linkedLicenses: number;
    nearLimitLicenses: number;
    overLimitLicenses: number;
    riskRatioPercent: number;
    unlimitedMappings: number;
  };
  saturationBuckets: Record<BucketKey, number>;
  saturationByLicenseType: Array<{
    buckets: Record<BucketKey, number>;
    licenseType: License['type'];
    total: number;
  }>;
  topRiskCustomers: CustomerAggregate[];
  topRiskLicenses: LicenseAggregate[];
  usageRows: EnrichedUsage[];
};

export const entitlementSaturationBuckets: Array<{
  colorClassName: string;
  key: BucketKey;
  label: string;
}> = [
  // These are drawn as fills on a `bg-muted` track (the usage bar, the stacked
  // saturation bar) and as legend dots on a card. Colour is the only encoding here,
  // so WCAG 1.4.11's 3:1 floor applies against the track — and the solid state tokens
  // missed it in one theme or the other on four of the five: `bg-warning` sat at
  // 2.92:1 on the light track, `bg-destructive` at 2.35:1 on the dark one.
  //
  // The `-subtle-foreground` values are this app's authored "reads against a page
  // surface" strength for each family, which is exactly what a mark on a muted track
  // needs. Naming a foreground token in a `bg-` utility looks odd, but the role fits:
  // this is the family's ink, and the track is a page surface. Every entry now clears
  // 4.69:1 or better against the track in both themes.
  {
    colorClassName: 'bg-success-subtle-foreground',
    key: 'under50',
    label: '< 50%',
  },
  {
    colorClassName: 'bg-info-subtle-foreground',
    key: 'between50and80',
    label: '50-80%',
  },
  {
    colorClassName: 'bg-warning-subtle-foreground',
    key: 'between80and100',
    label: '80-100%',
  },
  {
    colorClassName: 'bg-destructive-subtle-foreground',
    key: 'over100',
    label: '> 100%',
  },
  {
    colorClassName: 'bg-muted-foreground',
    key: 'unbounded',
    label: 'Unbounded',
  },
];

export function formatUsageRatio(ratio: number | null, locale: string) {
  if (ratio === null) {
    return 'Unbounded';
  }

  // Usage on a grant of nothing has no finite saturation to print.
  if (!Number.isFinite(ratio)) {
    return '>100%';
  }

  return `${(ratio * 100).toLocaleString(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}%`;
}

export function formatLimitOrState(
  mapping: LicenseEntitlement,
  locale: string,
) {
  if (mapping.entitlementType === 'BOOLEAN') {
    return mapping.value?.type === 'boolean' && mapping.value.value === false
      ? 'Disabled'
      : 'Enabled';
  }

  if (mapping.entitlementType === 'CONFIG') {
    return 'Configured';
  }

  const threshold =
    mapping.value?.type === 'number' ? (mapping.value.value as number) : null;

  if (threshold === null || isUnlimitedThreshold(threshold)) {
    return 'Unlimited';
  }

  return threshold.toLocaleString(locale);
}

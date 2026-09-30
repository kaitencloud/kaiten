import type { EntitlementUsage, LicenseEntitlement } from '@/api-client';
import {
  getLicenseEntitlementOveragePercent,
  getUsageRatio,
  getUsageScope,
  type UsageScope,
} from '@/domains/entitlement-usage';
import type { DashboardCollections } from './dashboard-metrics.collections';
import { getLicenseSlug } from './dashboard-metrics.helpers';

function getNumericValue(
  value: LicenseEntitlement['value'] | EntitlementUsage['value'] | undefined,
) {
  return value?.type === 'number' ? (value.value as number) : null;
}

/**
 * A ratio is valid for both scopes -- a periodic grant is "N per window" and
 * its usage is "used this window" -- but the two mean different things: a
 * lifetime ratio is monotone and durable, a periodic one is a point-in-time
 * sample of a cycle whose phase varies per instance. Bucketing them into one
 * row would erase that, so the scope is part of the row key.
 */
const buildRowKey = (licenseType: string, usageScope: UsageScope) =>
  `${licenseType}\u0000${usageScope}`;

export function buildEntitlementSaturationHeatmap(
  instances: DashboardCollections['instances'],
  licenses: DashboardCollections['licenses'],
  supplementaryData: DashboardCollections['supplementaryData'],
) {
  const entitlementRows = new Map<
    string,
    {
      between50And80: number;
      between80And100: number;
      licenseType: string;
      over100: number;
      unbounded: number;
      under50: number;
      usageScope: UsageScope;
    }
  >();
  const licenseTypeBySlug = new Map(
    licenses.map((license) => [license.slug, String(license.type)]),
  );
  const licenseEntitlementsByLicenseSlug =
    supplementaryData?.licenseEntitlementsByLicenseSlug ?? {};
  const numberEntitlementByLicenseAndEntitlementSlug = new Map<
    string,
    Map<string, LicenseEntitlement>
  >();

  for (const [licenseSlug, entitlements] of Object.entries(
    licenseEntitlementsByLicenseSlug,
  )) {
    const byEntitlementSlug = new Map<string, LicenseEntitlement>();

    for (const entitlement of entitlements) {
      if (
        entitlement.entitlementSlug != null &&
        entitlement.entitlementType === 'NUMBER' &&
        !byEntitlementSlug.has(entitlement.entitlementSlug)
      ) {
        byEntitlementSlug.set(entitlement.entitlementSlug, entitlement);
      }
    }

    numberEntitlementByLicenseAndEntitlementSlug.set(
      licenseSlug,
      byEntitlementSlug,
    );
  }

  const entitlementUsagesByInstanceSlug =
    supplementaryData?.entitlementUsagesByInstanceSlug ?? {};
  const instanceLicenseSlugByInstanceSlug = new Map<string, string>();
  let nearThresholdUsage = 0;
  let nearThresholdUsageCurrentPeriod = 0;
  let overThresholdUsage = 0;

  for (const instance of instances) {
    if (!instance.slug) {
      continue;
    }

    const licenseSlug = getLicenseSlug(instance);

    if (licenseSlug) {
      instanceLicenseSlugByInstanceSlug.set(instance.slug, licenseSlug);
    }
  }

  for (const [instanceSlug, entitlementUsages] of Object.entries(
    entitlementUsagesByInstanceSlug,
  )) {
    const fallbackLicenseSlug =
      instanceLicenseSlugByInstanceSlug.get(instanceSlug);

    for (const usage of entitlementUsages) {
      const licenseSlug = usage.licenseSlug ?? fallbackLicenseSlug;

      if (!licenseSlug) {
        continue;
      }

      // Only a numeric meter has a saturation to band. A BOOLEAN or CONFIG
      // grant would otherwise land in `unbounded` under a row now titled
      // "Lifetime total", presenting a feature flag as a usage counter -- the
      // sibling table column refuses exactly that.
      if (usage.value?.type !== 'number') {
        continue;
      }

      const licenseType = licenseTypeBySlug.get(licenseSlug) ?? 'UNKNOWN';
      const usageScope = getUsageScope(usage);
      const grant = numberEntitlementByLicenseAndEntitlementSlug
        .get(licenseSlug)
        ?.get(usage.entitlementSlug);
      const threshold = getNumericValue(grant?.value);
      const rowKey = buildRowKey(licenseType, usageScope);
      const row = entitlementRows.get(rowKey) ?? {
        between50And80: 0,
        between80And100: 0,
        licenseType,
        over100: 0,
        unbounded: 0,
        under50: 0,
        usageScope,
      };

      // Saturation runs against what the grant actually permits, so a soft
      // limit is not banded as over its cap while the API still accepts it.
      const usageValue = getNumericValue(usage.value) ?? 0;
      const ratio = getUsageRatio(
        usageValue,
        threshold,
        grant ? getLicenseEntitlementOveragePercent(grant) : null,
      );

      if (ratio === null) {
        row.unbounded += 1;
        entitlementRows.set(rowKey, row);
        continue;
      }

      if (ratio < 0.5) {
        row.under50 += 1;
      } else if (ratio < 0.8) {
        row.between50And80 += 1;
      } else if (ratio <= 1) {
        row.between80And100 += 1;
        nearThresholdUsage += 1;

        if (usageScope === 'PERIODIC') {
          nearThresholdUsageCurrentPeriod += 1;
        }
      } else {
        row.over100 += 1;
        overThresholdUsage += 1;
      }

      entitlementRows.set(rowKey, row);
    }
  }

  return {
    // Lifetime before periodic within a license type, so the durable signal
    // reads first.
    entitlementSaturationHeatmap: Array.from(entitlementRows.values()).sort(
      (left, right) =>
        left.licenseType.localeCompare(right.licenseType) ||
        left.usageScope.localeCompare(right.usageScope),
    ),
    nearThresholdUsage,
    nearThresholdUsageCurrentPeriod,
    overThresholdUsage,
  };
}

import type {
  Entitlement,
  EntitlementUsage,
  LicenseEntitlement,
} from '@/api-client';
import {
  getLicenseEntitlementOveragePercent,
  getMaximumAllowedUsage,
  getUsageStatus,
  isPeriodicEntitlement,
  isSoftLimit,
} from '@/domains/entitlement-usage';
import type { ServedProvenance } from './entitlement-provenance.utils';
import { buildUsageOnlyRow } from './usage-only-entitlement-row';

export type InstanceEntitlementGroup = {
  id: string;
  name: string;
  slug: string;
};

export type InstanceEntitlementGroupOption = {
  label: string;
  value: string;
};

export type InstanceEntitlementRow = {
  entitlementId: string;
  entitlementGroups: InstanceEntitlementGroup[];
  entitlementIcon?: string | null;
  entitlementName: string;
  entitlementSlug: string | null;
  entitlementType: 'NUMBER' | 'BOOLEAN' | 'CONFIG';
  // What the catalogue calls this entitlement, which the grant alone cannot
  // say: its own type has no AI-credit variant. For the label only --
  // enforcement follows entitlementType, where the AI-credit family is NUMBER.
  catalogueEntitlementType?: NonNullable<Entitlement['type']> | null;
  value: number;
  // Bounds of the usage window this value belongs to; both absent for a
  // lifetime counter. Start is inclusive, end exclusive.
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  threshold: number | null;
  // Enforcement for this grant, derived from its own numeric value: -1 when
  // the value is unlimited, 0 for a hard limit, a positive percentage for a
  // soft limit the API still accepts usage above `threshold` for. Null for
  // the non-numeric grants that have no cap to exceed.
  limitCapExceededOveragePercent: number | null;
  enabled: boolean | null;
  // Where the effective value comes from: the license grants it (the add-ons and
  // the vouchers of the instance may change it), or only its add-ons do. Rows built
  // without a usage behind them come from the license.
  source?: EntitlementUsage['source'];
  // What the license, the add-ons and the vouchers each contribute to the effective
  // value, as the API sends it. Absent when the API sent none.
  provenance?: ServedProvenance | null;
};

export const isSoftLimitEntitlement = (entitlement: InstanceEntitlementRow) =>
  entitlement.entitlementType === 'NUMBER' &&
  isSoftLimit(
    entitlement.threshold,
    entitlement.limitCapExceededOveragePercent,
  );

const getLicenseEntitlementId = (entitlement: LicenseEntitlement) => {
  const dynamic = entitlement as unknown as { entitlementId?: unknown };
  return typeof dynamic.entitlementId === 'string'
    ? dynamic.entitlementId
    : null;
};

const getLicenseEntitlementGroups = (
  entitlement: LicenseEntitlement,
): InstanceEntitlementGroup[] =>
  (entitlement.entitlementGroups ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    slug: group.slug,
  }));

// The cap an instance runs under: the limit its usage is measured against, which
// the API composes from the grant of the license and what the add-ons the instance
// holds add to it, replace it by or raise it to; without one (a usage that carries
// no limit), the grant of the license alone.
const getThreshold = (
  entitlement: LicenseEntitlement,
  usage: EntitlementUsage | undefined,
): number | null => {
  if (usage?.limit?.type === 'number') {
    return usage.limit.value as number;
  }

  return entitlement.value?.type === 'number'
    ? (entitlement.value.value as number)
    : null;
};

export const buildEntitlementsRows = (
  licenseEntitlements: LicenseEntitlement[],
  entitlementUsages: EntitlementUsage[],
  unknownEntitlementLabel: string,
  entitlements: Entitlement[] = [],
): InstanceEntitlementRow[] => {
  const iconBySlug = new Map(
    entitlements.flatMap((entitlement) =>
      entitlement.slug ? [[entitlement.slug, entitlement.icon ?? null]] : [],
    ),
  );
  const nameBySlug = new Map(
    entitlements.flatMap((entitlement) =>
      entitlement.slug ? [[entitlement.slug, entitlement.name]] : [],
    ),
  );
  const iconByName = new Map(
    entitlements.map((entitlement) => [
      entitlement.name,
      entitlement.icon ?? null,
    ]),
  );
  const catalogueTypeBySlug = new Map<string, NonNullable<Entitlement['type']>>(
    entitlements.flatMap((entitlement) =>
      entitlement.slug && entitlement.type
        ? [[entitlement.slug, entitlement.type]]
        : [],
    ),
  );
  const catalogueTypeByName = new Map<string, NonNullable<Entitlement['type']>>(
    entitlements.flatMap((entitlement) =>
      entitlement.type ? [[entitlement.name, entitlement.type]] : [],
    ),
  );
  const usageByEntitlementId = new Map<string, EntitlementUsage>(
    entitlementUsages.map((usage) => [usage.entitlementId, usage]),
  );
  const usageByEntitlementSlug = new Map<string, EntitlementUsage>(
    entitlementUsages.map((usage) => [usage.entitlementSlug, usage]),
  );
  const usedUsageIds = new Set<string>();

  const enrichedEntitlements = licenseEntitlements.map((entitlement, index) => {
    const entitlementId = getLicenseEntitlementId(entitlement);
    const mappedUsageById = entitlementId
      ? usageByEntitlementId.get(entitlementId)
      : undefined;
    // Usage order is not guaranteed to match license entitlement order.
    // Fall back to the stable entitlement slug instead of array position.
    const mappedUsageBySlug =
      !mappedUsageById && entitlement.entitlementSlug
        ? usageByEntitlementSlug.get(entitlement.entitlementSlug)
        : undefined;
    const usage = mappedUsageById ?? mappedUsageBySlug;

    if (usage?.entitlementId) {
      usedUsageIds.add(usage.entitlementId);
    }

    return {
      entitlementId:
        entitlementId ??
        usage?.entitlementId ??
        entitlement.entitlementSlug ??
        `ent-${index}`,
      entitlementGroups: getLicenseEntitlementGroups(entitlement),
      entitlementIcon:
        (entitlement.entitlementSlug
          ? iconBySlug.get(entitlement.entitlementSlug)
          : null) ??
        iconByName.get(entitlement.entitlementName) ??
        null,
      entitlementName: entitlement.entitlementName || unknownEntitlementLabel,
      entitlementSlug: entitlement.entitlementSlug ?? null,
      entitlementType:
        entitlement.entitlementType === 'NUMBER'
          ? 'NUMBER'
          : entitlement.entitlementType === 'CONFIG'
            ? 'CONFIG'
            : 'BOOLEAN',
      catalogueEntitlementType:
        (entitlement.entitlementSlug
          ? catalogueTypeBySlug.get(entitlement.entitlementSlug)
          : undefined) ??
        catalogueTypeByName.get(entitlement.entitlementName) ??
        null,
      value:
        usage?.value?.type === 'number' ? (usage.value.value as number) : 0,
      currentPeriodStart: usage?.currentPeriodStart ?? null,
      currentPeriodEnd: usage?.currentPeriodEnd ?? null,
      threshold: getThreshold(entitlement, usage),
      // The percent the API composes, as the cap is: an add-on may lower it, and a
      // license grant alone says what it was before the add-ons.
      limitCapExceededOveragePercent:
        usage?.limitCapExceededOveragePercent ??
        getLicenseEntitlementOveragePercent(entitlement),
      enabled:
        entitlement.value?.type === 'boolean'
          ? (entitlement.value.value as boolean)
          : null,
      source: usage?.source ?? 'license',
      provenance: usage?.provenance ?? null,
    } as const;
  });

  const usageOnlyEntitlements: InstanceEntitlementRow[] = entitlementUsages
    .filter((usage) => !usedUsageIds.has(usage.entitlementId))
    .map((usage) =>
      buildUsageOnlyRow(usage, {
        iconBySlug,
        nameBySlug,
        typeBySlug: catalogueTypeBySlug,
      }),
    );

  return [...enrichedEntitlements, ...usageOnlyEntitlements];
};

export const buildInstanceEntitlementGroupOptions = (
  entitlements: InstanceEntitlementRow[],
): InstanceEntitlementGroupOption[] => {
  const optionsBySlug = new Map<string, InstanceEntitlementGroupOption>();

  for (const entitlement of entitlements) {
    for (const group of entitlement.entitlementGroups) {
      optionsBySlug.set(group.slug, {
        label: group.name,
        value: group.slug,
      });
    }
  }

  return [...optionsBySlug.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
};

export const isEntitlementInGroup = (
  entitlement: InstanceEntitlementRow,
  groupSlug: string,
) => entitlement.entitlementGroups.some((group) => group.slug === groupSlug);

export const filterEntitlementsRowsByGroup = (
  entitlements: InstanceEntitlementRow[],
  groupSlug: string,
) => {
  if (groupSlug === 'all') {
    return entitlements;
  }

  return entitlements.filter((entitlement) =>
    isEntitlementInGroup(entitlement, groupSlug),
  );
};

// Null for anything the API would never reject on a count: the non-numeric
// types, and the unlimited or unset thresholds.
const getEntitlementCeiling = (entitlement: InstanceEntitlementRow) =>
  entitlement.entitlementType === 'NUMBER'
    ? getMaximumAllowedUsage(
        entitlement.threshold,
        entitlement.limitCapExceededOveragePercent,
      )
    : null;

export const isEntitlementExhausted = (entitlement: InstanceEntitlementRow) => {
  const ceiling = getEntitlementCeiling(entitlement);

  return ceiling !== null && entitlement.value >= ceiling;
};

export const isEntitlementEnabled = (entitlement: InstanceEntitlementRow) =>
  !isEntitlementExhausted(entitlement);

// What the status column badges in the warning colour, so the cards count the
// rows a reader sees flagged: near the most the grant permits, or into the
// overage a soft limit tolerates. A counter on its wall or past it is spent,
// not near, and the enabled count already takes it out.
export const isEntitlementNearThreshold = (
  entitlement: InstanceEntitlementRow,
) => {
  if (getEntitlementCeiling(entitlement) === null) {
    return false;
  }

  const status = getUsageStatus(
    entitlement.value,
    entitlement.threshold,
    entitlement.limitCapExceededOveragePercent,
  );

  return status === 'NEAR_LIMIT' || status === 'IN_ALLOWANCE';
};

export const getEntitlementsMetrics = (
  entitlements: InstanceEntitlementRow[],
) => {
  const total = entitlements.length;
  const enabled = entitlements.filter(isEntitlementEnabled).length;
  // A lifetime counter near its cap only ever climbs, so it means "buy more";
  // a period-scoped one clears at the next reset, so it may mean "wait". Both
  // deserve the alert, but they call for different action -- the split travels
  // alongside the union figure rather than replacing it.
  const nearThresholdEntitlements = entitlements.filter(
    isEntitlementNearThreshold,
  );
  const nearThresholdCurrentPeriod = nearThresholdEntitlements.filter(
    isPeriodicEntitlement,
  ).length;
  const numberEntitlements = entitlements.filter(
    (entitlement) => entitlement.entitlementType === 'NUMBER',
  );

  return {
    total,
    enabled,
    // The counters badged red: on their wall or past it, nothing more is
    // accepted.
    limitReached: entitlements.filter(isEntitlementExhausted).length,
    nearThreshold: nearThresholdEntitlements.length,
    nearThresholdCurrentPeriod,
    nearThresholdLifetime:
      nearThresholdEntitlements.length - nearThresholdCurrentPeriod,
    numberEntitlements,
  };
};

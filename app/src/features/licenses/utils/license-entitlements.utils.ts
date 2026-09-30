import {
  getLicenseEntitlementOveragePercent,
  isHardLimit,
  isUnlimitedThreshold,
  resolveLimitCapExceededOveragePercent,
} from '@/domains/entitlement-usage';
import { generateSlug } from '@/functionals/slug';
import { formatNumber } from '@/lib/format-date';
import type { Entitlement, LicenseEntitlement } from '@/api-client';

export type EditableLicenseEntitlement = {
  configValue?: Record<string, unknown>;
  enabled: boolean | null;
  entitlementIcon?: string | null;
  entitlementId: string | null;
  entitlementName: string;
  entitlementType: 'BOOLEAN' | 'NUMBER' | 'CONFIG';
  // Enforcement of a NUMBER grant, derived from its own threshold (see
  // resolveLimitCapExceededOveragePercent): -1 when the threshold is
  // unlimited, 0 for a hard limit, a positive percentage for a soft limit.
  // Null for BOOLEAN and CONFIG grants, which have nothing to enforce.
  limitCapExceededOveragePercent: number | null;
  threshold: number | null;
};

// NUMBER_AI_CREDIT is a NUMBER-family type on the API side: same numeric
// value, same cap, same overage rules. The grant editor therefore treats it
// exactly like NUMBER.
type CatalogueEntitlementType =
  | Entitlement['type']
  | LicenseEntitlement['entitlementType']
  | null;

export const isNumericEntitlementType = (
  type: CatalogueEntitlementType,
): boolean => type === 'NUMBER' || type === 'NUMBER_AI_CREDIT';

export const toEditableEntitlementType = (
  type: CatalogueEntitlementType,
): EditableLicenseEntitlement['entitlementType'] =>
  isNumericEntitlementType(type)
    ? 'NUMBER'
    : type === 'CONFIG'
      ? 'CONFIG'
      : 'BOOLEAN';

const getDynamicEntitlementId = (
  entitlement: LicenseEntitlement,
): string | null => {
  const dynamicEntitlement = entitlement as unknown as {
    entitlementId?: unknown;
  };

  return typeof dynamicEntitlement.entitlementId === 'string'
    ? dynamicEntitlement.entitlementId
    : null;
};

export const resolveLicenseEntitlements = (
  licenseEntitlements: LicenseEntitlement[],
  entitlements: Entitlement[],
): EditableLicenseEntitlement[] => {
  const entitlementIdByName = new Map(
    entitlements.map((entitlement) => [entitlement.name, entitlement.id]),
  );

  const entitlementTypeByName = new Map(
    entitlements.map((entitlement) => [entitlement.name, entitlement.type]),
  );

  const entitlementIconByName = new Map(
    entitlements.map((entitlement) => [entitlement.name, entitlement.icon]),
  );

  return licenseEntitlements.map((entitlement) => {
    const fallbackEntitlementId = entitlementIdByName.get(
      entitlement.entitlementName,
    );
    const fallbackEntitlementType = entitlementTypeByName.get(
      entitlement.entitlementName,
    );

    const valueType = entitlement.value?.type as string | undefined;

    return {
      configValue:
        valueType === 'object'
          ? (entitlement.value.value as Record<string, unknown>)
          : undefined,
      enabled:
        valueType === 'boolean' ? (entitlement.value.value as boolean) : null,
      entitlementIcon:
        entitlementIconByName.get(entitlement.entitlementName) ?? null,
      entitlementId:
        getDynamicEntitlementId(entitlement) ?? fallbackEntitlementId ?? null,
      entitlementName: entitlement.entitlementName,
      entitlementType: toEditableEntitlementType(
        entitlement.entitlementType ?? fallbackEntitlementType,
      ),
      limitCapExceededOveragePercent:
        getLicenseEntitlementOveragePercent(entitlement),
      threshold:
        valueType === 'number' ? (entitlement.value.value as number) : null,
    } satisfies EditableLicenseEntitlement;
  });
};

export const parseThresholdInput = (
  input: string,
  unlimitedTokens: string[] = [],
): number | null => {
  const trimmed = input.trim();
  const normalize = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const normalizedUnlimitedTokens = new Set([
    'unlimited',
    'illimite',
    ...unlimitedTokens.map((token) => normalize(token)),
  ]);

  if (
    trimmed.length === 0 ||
    normalizedUnlimitedTokens.has(normalize(trimmed))
  ) {
    return -1;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed < -1) {
    return null;
  }

  return parsed;
};

// Percent typed for a capped NUMBER grant. Empty means "no overage", i.e. a
// hard limit; anything else must be a whole percentage >= 0.
export const parseOveragePercentInput = (input: string): number | null => {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return 0;
  }

  const parsed = Number(trimmed.replace(/%$/, '').trim());

  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
};

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export const formatEntitlementOveragePercent = (
  entitlement: EditableLicenseEntitlement,
  translate?: TranslateFn,
): string => {
  const tr = (
    key: string,
    fallback: string,
    options?: Record<string, unknown>,
  ) => (translate ? translate(key, options) : fallback);

  // Same "not applicable" glyph as the other cells of the licenses feature.
  if (
    entitlement.entitlementType !== 'NUMBER' ||
    isUnlimitedThreshold(entitlement.threshold)
  ) {
    return '-';
  }

  if (
    isHardLimit(
      entitlement.threshold,
      entitlement.limitCapExceededOveragePercent,
    )
  ) {
    return tr('Pages.Licenses.Entitlements.Status.hardLimit', 'Hard limit');
  }

  const percent = resolveLimitCapExceededOveragePercent(
    entitlement.threshold,
    entitlement.limitCapExceededOveragePercent,
  );

  return tr(
    'Pages.Licenses.Entitlements.Status.softLimit',
    `+${percent}% overage`,
    { percent },
  );
};

export const formatEntitlementThreshold = (
  entitlement: EditableLicenseEntitlement,
  translate?: TranslateFn,
): string => {
  const tr = (key: string, fallback: string) =>
    translate ? translate(key) : fallback;

  if (entitlement.entitlementType === 'BOOLEAN') {
    return entitlement.enabled === false
      ? tr('Pages.Licenses.Entitlements.Status.disabled', 'Disabled')
      : tr('Pages.Licenses.Entitlements.Status.enabled', 'Enabled');
  }

  if (entitlement.entitlementType === 'CONFIG') {
    return tr('Pages.Licenses.Entitlements.Status.configured', 'Configured');
  }

  const { threshold } = entitlement;

  if (threshold === null || isUnlimitedThreshold(threshold)) {
    return tr('Pages.Licenses.Entitlements.Status.unlimited', 'Unlimited');
  }

  return formatNumber(threshold);
};

export const getEntitlementSlug = (entitlement: Entitlement): string => {
  const dynamicEntitlement = entitlement as unknown as {
    slug?: unknown;
  };

  if (typeof dynamicEntitlement.slug === 'string') {
    const normalizedSlug = dynamicEntitlement.slug.trim();
    if (normalizedSlug.length > 0) {
      return normalizedSlug;
    }
  }

  // Same rules as the API's generator, which named the entitlement.
  return generateSlug(entitlement.name);
};

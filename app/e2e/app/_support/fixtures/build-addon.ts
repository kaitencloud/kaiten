import type {
  Addon,
  AddonEntitlement,
  InstanceAddon,
  Price,
} from '@/api-client';

const CREATED_AT = '2026-03-01T09:00:00.000Z';

/**
 * Build a version of an add-on, as the API answers it. `slug` names the version and
 * `familySlug` its family; the version number follows `version`, and the version is
 * called "Version - n" unless it has a name of its own.
 */
export function buildAddon({
  createdAt = CREATED_AT,
  description = '',
  familySlug,
  isDefault = false,
  lifecycleState = 'PUBLISHED',
  maxQuantity,
  name,
  pricingType = 'PAID',
  slug,
  version = 1,
  versionName,
}: {
  createdAt?: string;
  description?: string;
  familySlug: string;
  isDefault?: boolean;
  lifecycleState?: Addon['lifecycleState'];
  maxQuantity?: number;
  name: string;
  pricingType?: Addon['pricingType'];
  slug: string;
  version?: number;
  versionName?: string;
}): Addon {
  return {
    createdAt,
    description,
    familySlug,
    id: `addon-${slug}`,
    isDefault,
    lifecycleState,
    maxQuantity,
    name,
    pricingType,
    slug,
    updatedAt: createdAt,
    version,
    versionName: versionName ?? `Version - ${version}`,
  };
}

/**
 * Build what a version grants per unit of quantity: a number (`-1` is unlimited), a
 * flag, or a configuration. The overage a number allows is left out to inherit the
 * license's.
 */
export function buildAddonGrant({
  addonSlug,
  behavior = 'MAX',
  entitlementSlug,
  entitlementType,
  overagePercent,
  value,
}: {
  addonSlug: string;
  behavior?: AddonEntitlement['overrideBehavior'];
  entitlementSlug: string;
  entitlementType?: AddonEntitlement['entitlementType'];
  /** Of a number grant: 0 is a hard limit, above 0 a soft one; left out, it inherits the license's. */
  overagePercent?: number;
  value: number | boolean | Record<string, unknown>;
}): AddonEntitlement {
  const isNumber = typeof value === 'number';

  return {
    entitlementSlug,
    entitlementType:
      entitlementType ??
      (typeof value === 'boolean' ? 'BOOLEAN' : isNumber ? 'NUMBER' : 'CONFIG'),
    id: `grant-${addonSlug}-${entitlementSlug}`,
    limitCapExceededOveragePercent: isNumber ? overagePercent : undefined,
    overrideBehavior: behavior,
    value:
      typeof value === 'boolean'
        ? { type: 'boolean', value }
        : isNumber
          ? { type: 'number', value }
          : { type: 'object', value },
  };
}

/**
 * Build what an instance holds of an add-on. The prices are the ones its
 * subscription bills: the default flat fee of the period of the subscription, and
 * none for an instance nobody bills.
 */
export function buildInstanceAddon({
  addon,
  attachedAt = CREATED_AT,
  id,
  prices = [],
  quantity = 1,
  removedAt,
}: {
  addon: Pick<Addon, 'familySlug' | 'id' | 'maxQuantity' | 'slug'>;
  attachedAt?: string;
  id: string;
  prices?: Price[];
  quantity?: number;
  removedAt?: string;
}): InstanceAddon {
  return {
    addonId: addon.id,
    addonSlug: addon.slug,
    attachedAt,
    familySlug: addon.familySlug,
    id,
    maxQuantity: addon.maxQuantity,
    prices,
    quantity,
    removedAt,
  };
}

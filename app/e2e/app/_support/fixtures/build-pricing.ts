import type {
  Entitlement,
  License,
  LicenseEntitlement,
  Price,
} from '@/api-client';
import { TEST_USER } from './build-customer';
import { NULL_OBJECT } from './null-object';

const CREATED_AT = '2026-03-01T09:00:00.000Z';

/**
 * Build an entitlement of the catalogue a priced license version grants. A
 * number entitlement is a flow when it has a reset period and a stock when it
 * has none, which is what decides whether a price may meter it.
 */
export function buildEntitlement({
  aggregationMethod,
  createdAt = CREATED_AT,
  id,
  name,
  resetPeriod,
  saleUnit,
  slug,
  type = 'NUMBER',
  unit,
}: {
  aggregationMethod?: Entitlement['aggregationMethod'];
  createdAt?: string;
  id?: string;
  name: string;
  resetPeriod?: Entitlement['resetPeriod'];
  /** One sale unit is `factor` base units, named by `label` ("1k requests"). */
  saleUnit?: { factor: number; label: string };
  slug: string;
  type?: Entitlement['type'];
  /** The base unit, singular and plural. */
  unit?: { plural: string; singular: string };
}): Entitlement {
  return {
    aggregationMethod,
    createdAt,
    description: null,
    id: id ?? `entitlement-${slug}`,
    name,
    resetAnchor: resetPeriod ? 'CALENDAR' : undefined,
    resetPeriod,
    saleUnitFactor: saleUnit?.factor,
    saleUnitPlural: saleUnit?.label,
    saleUnitSingular: saleUnit?.label,
    slug,
    type,
    unitPlural: unit?.plural,
    unitSingular: unit?.singular,
    updatedAt: createdAt,
  };
}

/** A grant: a number (-1 is unlimited), a flag, or a configuration. */
export function buildGrant({
  entitlement,
  license,
  overagePercent,
  value,
}: {
  entitlement: Pick<Entitlement, 'name' | 'slug' | 'type'>;
  license: Pick<License, 'id' | 'slug'>;
  /** Of a number grant: 0 is a hard limit, above 0 a soft one, -1 with an unlimited value. */
  overagePercent?: number;
  value: number | boolean | Record<string, unknown>;
}): LicenseEntitlement {
  const isNumber = typeof value === 'number';

  return {
    createdAt: CREATED_AT,
    createdBy: TEST_USER,
    entitlementName: entitlement.name,
    entitlementSlug: entitlement.slug,
    entitlementType:
      typeof value === 'boolean' ? 'BOOLEAN' : isNumber ? 'NUMBER' : 'CONFIG',
    licenseId: license.id,
    licenseSlug: license.slug ?? license.id,
    limitCapExceededOveragePercent: isNumber
      ? (overagePercent ?? (value === -1 ? -1 : 0))
      : undefined,
    updatedAt: CREATED_AT,
    updatedBy: TEST_USER,
    value:
      typeof value === 'boolean'
        ? { type: 'boolean', value }
        : isNumber
          ? { type: 'number', value }
          : { type: 'object', value },
  };
}

/**
 * Build a price of a license version, as the API answers it. Amounts are in
 * minor units, as strings: `unitAmountDecimal: '2900'` is $29.00 in USD.
 */
export function buildPrice({
  billingModel = 'FLAT_FEE',
  billingPeriod,
  billingTiming,
  createdAt = CREATED_AT,
  currency = 'USD',
  deprecatedAt,
  displayLabel,
  displayOrder = 0,
  id,
  isDefault = false,
  metered,
  status = 'ACTIVE',
  unitAmountDecimal,
}: {
  billingModel?: Price['billingModel'];
  /** Required on a flat fee, absent on a metered price. */
  billingPeriod?: Price['billingPeriod'];
  billingTiming?: Price['billingTiming'];
  createdAt?: string;
  currency?: string;
  deprecatedAt?: string;
  displayLabel?: string;
  displayOrder?: number;
  id: string;
  isDefault?: boolean;
  metered?: Price['metered'];
  status?: Price['status'];
  unitAmountDecimal: string;
}): Price {
  const isMetered = billingModel !== 'FLAT_FEE';

  return {
    billingModel,
    billingPeriod: isMetered ? null : (billingPeriod ?? 'MONTHLY'),
    billingTiming: billingTiming ?? (isMetered ? 'ARREARS' : 'ADVANCE'),
    createdAt,
    currency,
    deprecatedAt: deprecatedAt ?? null,
    displayLabel: displayLabel ?? null,
    displayOrder,
    id,
    isDefault,
    metered: metered ?? NULL_OBJECT,
    status,
    unitAmount: /^\d+$/.test(unitAmountDecimal)
      ? Number(unitAmountDecimal)
      : null,
    unitAmountDecimal,
    updatedAt: createdAt,
  };
}

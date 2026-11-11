import type { AiUsage, VendorCosts } from '@/api-client';

import {
  add,
  type Decimal,
  isNegative,
  isPositive,
  multiply,
  ONE,
  parseDecimal,
  toDecimalString,
  ZERO,
} from './decimal';
import { parseUsage } from './price-usage';
import type { PricingDimension } from './types';

/**
 * What a usage costs at the vendor, in USD, from a model's catalogue costs.
 * The catalogue has no per-second cost, so a duration is never costed. Cache
 * costs fall back to the input cost, as rates do.
 */

export type VendorCostLine = {
  dimension: Exclude<PricingDimension, 'SECOND'>;
  quantity: string;
  /** USD per unit of the dimension, after the cache fallback. */
  cost: string;
  costSource: 'OWN' | 'INPUT_FALLBACK';
  /** `cost × quantity`, exact. */
  usd: string;
};

export type VendorCostResult = {
  /** At least one cost applied: `total` means something. */
  known: boolean;
  /** Every dimension with a positive quantity had a cost. */
  complete: boolean;
  /** Exact USD total, or null when no cost applied. */
  total: string | null;
  lines: VendorCostLine[];
  /** Dimensions with a positive quantity and no cost in the catalogue. */
  uncosted: VendorCostLine['dimension'][];
};

const UNKNOWN: VendorCostResult = {
  known: false,
  complete: false,
  total: null,
  lines: [],
  uncosted: [],
};

function cost(text: string | undefined): Decimal | null {
  const value = parseDecimal(text);

  return value === null || isNegative(value) ? null : value;
}

export function vendorCost(
  costs: VendorCosts | undefined | null,
  usage: AiUsage | undefined,
): VendorCostResult {
  const quantities = parseUsage(usage);
  if (!costs || quantities === null) {
    return UNKNOWN;
  }
  const input = cost(costs.perInputToken);
  const cachedInput = cost(costs.perCachedInputToken);
  const cacheWrite = cost(costs.perCacheWriteToken);
  const entries: [
    VendorCostLine['dimension'],
    Decimal | null,
    Decimal | null,
    VendorCostLine['costSource'],
  ][] = [
    ['REQUEST', cost(costs.perRequest), ONE, 'OWN'],
    ['INPUT_TOKEN', input, quantities.input, 'OWN'],
    [
      'CACHE_READ_TOKEN',
      cachedInput ?? input,
      quantities.cacheRead,
      cachedInput === null ? 'INPUT_FALLBACK' : 'OWN',
    ],
    [
      'CACHE_WRITE_TOKEN',
      cacheWrite ?? input,
      quantities.cacheWrite,
      cacheWrite === null ? 'INPUT_FALLBACK' : 'OWN',
    ],
    ['OUTPUT_TOKEN', cost(costs.perOutputToken), quantities.output, 'OWN'],
    ['UNIT', cost(costs.perUnit), quantities.units, 'OWN'],
  ];
  const lines: VendorCostLine[] = [];
  const uncosted: VendorCostLine['dimension'][] = [];
  let total = ZERO;
  for (const [dimension, unitCost, quantity, costSource] of entries) {
    if (quantity === null) {
      continue;
    }
    if (unitCost === null) {
      if (dimension !== 'REQUEST' && isPositive(quantity)) {
        uncosted.push(dimension);
      }
      continue;
    }
    const usd = multiply(unitCost, quantity);
    total = add(total, usd);
    lines.push({
      dimension,
      quantity: toDecimalString(quantity),
      cost: toDecimalString(unitCost),
      costSource,
      usd: toDecimalString(usd),
    });
  }
  const known = lines.length > 0;

  return {
    known,
    complete: known && uncosted.length === 0,
    total: known ? toDecimalString(total) : null,
    lines,
    uncosted,
  };
}

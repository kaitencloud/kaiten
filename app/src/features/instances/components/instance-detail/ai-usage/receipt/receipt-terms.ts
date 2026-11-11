import { type PricingTerms, sameDecimal } from '../engine';

/**
 * Comparing the terms a snapshot applied with the rule as it is now: whether
 * they price differently, and which of them changed. By value, never by
 * spelling ("0.0004" and "0.00040" are the same rate).
 */

const TERM_KEYS = [
  'perRequest',
  'perInputToken',
  'perCachedInputToken',
  'perCacheWriteToken',
  'perOutputToken',
  'perUnit',
  'perSecond',
] as const;

export type ChangedTerms = {
  rates: Partial<Record<(typeof TERM_KEYS)[number], string | null>>;
  minimumCreditsPerRequest?: string;
  maximumCreditsPerRequest?: string | null;
  chargeOnError?: PricingTerms['chargeOnError'];
};

function sameOptional(left?: string | null, right?: string | null) {
  return left == null || right == null
    ? left == null && right == null
    : sameDecimal(left, right);
}

/** Whether two sets of terms price differently (rates, bounds or policy). */
export function termsDiffer(left: PricingTerms, right: PricingTerms) {
  return (
    left.chargeOnError !== right.chargeOnError ||
    !sameOptional(
      left.minimumCreditsPerRequest,
      right.minimumCreditsPerRequest,
    ) ||
    !sameOptional(
      left.maximumCreditsPerRequest,
      right.maximumCreditsPerRequest,
    ) ||
    TERM_KEYS.some((key) => !sameOptional(left.rates[key], right.rates[key]))
  );
}

/** The terms of `current` that differ from those `applied`, as they are now. */
export function changedTerms(
  applied: PricingTerms,
  current: PricingTerms,
): ChangedTerms {
  const rates: ChangedTerms['rates'] = {};
  for (const key of TERM_KEYS) {
    if (!sameOptional(applied.rates[key], current.rates[key])) {
      rates[key] = current.rates[key] ?? null;
    }
  }

  return {
    rates,
    ...(sameOptional(
      applied.minimumCreditsPerRequest,
      current.minimumCreditsPerRequest,
    )
      ? {}
      : { minimumCreditsPerRequest: current.minimumCreditsPerRequest }),
    ...(sameOptional(
      applied.maximumCreditsPerRequest,
      current.maximumCreditsPerRequest,
    )
      ? {}
      : { maximumCreditsPerRequest: current.maximumCreditsPerRequest }),
    ...(applied.chargeOnError === current.chargeOnError
      ? {}
      : { chargeOnError: current.chargeOnError }),
  };
}

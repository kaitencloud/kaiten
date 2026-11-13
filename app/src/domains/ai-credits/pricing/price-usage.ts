import type { AiUsage } from '@/api-client';

import {
  add,
  compare,
  type Decimal,
  fromInteger,
  hasAtMostPlaces,
  isNegative,
  maxOf,
  minOf,
  ONE,
  parseDecimal,
  round,
  shift,
  toDecimalString,
  ZERO,
  multiply,
} from './decimal';
import type {
  AiRequestStatus,
  ChargeOnError,
  PricingDimension,
  PricingTerms,
} from './types';

/** Mirrors `aicredit.Price` (api/internal/modules/instances/usage/aicredit/pricing.go). */

export const RATE_PLACES = 10;
export const CREDIT_PLACES = 6;

export type PriceLine = {
  dimension: PricingDimension;
  /** The reported quantity; seconds for `SECOND` (milliseconds ÷ 1000). */
  quantity: string;
  /** The rate applied, after the cache fallback. */
  rate: string;
  /** `INPUT_FALLBACK` when a cache rate is null and the input rate applies. */
  rateSource: 'OWN' | 'INPUT_FALLBACK';
  /** `rate × quantity`, exact, before the final rounding. */
  credits: string;
};

export type PricingWarning = 'CONVERSION_INPUT_MISSING';

export type PriceError =
  | 'NO_RATE'
  | 'INVALID_RATE'
  | 'INVALID_MINIMUM'
  | 'INVALID_MAXIMUM'
  | 'INVALID_POLICY'
  | 'INVALID_USAGE'
  | 'INVALID_STATUS';

export type Priced = {
  ok: true;
  lines: PriceLine[];
  /** The vector's sum (or the minimum on missing input), unrounded. */
  exactComputed: string;
  /** Rounded half-up to 6 decimals, as stored in `credits.computed`. */
  computed: string;
  /** Rounded half-up to 6 decimals, as stored in `credits.charged`. */
  charged: string;
  /** Whether the policy lets this request status charge. */
  chargeable: boolean;
  /** Which bound moved the charge, compared before rounding. */
  clamp: 'MINIMUM' | 'MAXIMUM' | null;
  /** No priced dimension had a reported quantity: computed is the minimum. */
  missingInput: boolean;
  warnings: PricingWarning[];
};

export type PriceOutcome = Priced | { ok: false; error: PriceError };

const POLICIES: readonly ChargeOnError[] = [
  'NEVER',
  'ALWAYS',
  'PROVIDER_ERROR_ONLY',
];
const STATUSES: readonly AiRequestStatus[] = [
  'SUCCESS',
  'PROVIDER_ERROR',
  'CUSTOMER_ERROR',
  'NOT_SENT',
];

/** NOT_SENT never charges, even under ALWAYS. */
export function isChargeable(
  policy: ChargeOnError,
  status: AiRequestStatus,
): boolean {
  switch (status) {
    case 'SUCCESS':
      return true;
    case 'PROVIDER_ERROR':
      return policy === 'ALWAYS' || policy === 'PROVIDER_ERROR_ONLY';
    case 'CUSTOMER_ERROR':
      return policy === 'ALWAYS';
    default:
      return false;
  }
}

type ParsedRates = Record<PricingDimension, Decimal | null>;
type ParsedTerms = {
  rates: ParsedRates;
  minimum: Decimal;
  maximum: Decimal | null;
};

function parseRate(
  text: string | null | undefined,
): Decimal | null | 'invalid' {
  if (text == null) {
    return null;
  }
  const rate = parseDecimal(text);
  if (
    rate === null ||
    isNegative(rate) ||
    !hasAtMostPlaces(rate, RATE_PLACES)
  ) {
    return 'invalid';
  }

  return rate;
}

/** Mirrors `Rule.Validate`, in its order, and returns the parsed terms. */
export function parsePricingTerms(
  terms: PricingTerms,
): ParsedTerms | { error: PriceError } {
  const { rates } = terms;
  const entries: [PricingDimension, string | null | undefined][] = [
    ['REQUEST', rates.perRequest],
    ['INPUT_TOKEN', rates.perInputToken],
    ['CACHE_READ_TOKEN', rates.perCachedInputToken],
    ['CACHE_WRITE_TOKEN', rates.perCacheWriteToken],
    ['OUTPUT_TOKEN', rates.perOutputToken],
    ['UNIT', rates.perUnit],
    ['SECOND', rates.perSecond],
  ];
  const parsed = {} as ParsedRates;
  let present = false;
  for (const [dimension, text] of entries) {
    const rate = parseRate(text);
    if (rate === 'invalid') {
      return { error: 'INVALID_RATE' };
    }
    present ||= rate !== null;
    parsed[dimension] = rate;
  }
  if (!present) {
    return { error: 'NO_RATE' };
  }
  const minimum = parseDecimal(terms.minimumCreditsPerRequest);
  if (
    minimum === null ||
    isNegative(minimum) ||
    !hasAtMostPlaces(minimum, CREDIT_PLACES)
  ) {
    return { error: 'INVALID_MINIMUM' };
  }
  let maximum: Decimal | null = null;
  if (terms.maximumCreditsPerRequest != null) {
    maximum = parseDecimal(terms.maximumCreditsPerRequest);
    if (
      maximum === null ||
      compare(maximum, minimum) < 0 ||
      !hasAtMostPlaces(maximum, CREDIT_PLACES)
    ) {
      return { error: 'INVALID_MAXIMUM' };
    }
  }
  if (!POLICIES.includes(terms.chargeOnError)) {
    return { error: 'INVALID_POLICY' };
  }

  return { rates: parsed, minimum, maximum };
}

type ParsedUsage = Record<
  'input' | 'cacheRead' | 'cacheWrite' | 'output' | 'seconds' | 'units',
  Decimal | null
>;

function count(value: number | undefined): Decimal | null | 'invalid' {
  if (value === undefined || value === null) {
    return null;
  }

  return Number.isSafeInteger(value) && value >= 0
    ? fromInteger(value)
    : 'invalid';
}

/** Mirrors `Usage.Validate`: counts are nonnegative integers, units a nonnegative decimal. */
export function parseUsage(usage: AiUsage | undefined): ParsedUsage | null {
  const u = usage ?? {};
  const counts = [
    count(u.inputTokens),
    count(u.cacheReadInputTokens),
    count(u.cacheWriteInputTokens),
    count(u.outputTokens),
    count(u.durationMs),
  ];
  if (counts.includes('invalid')) {
    return null;
  }
  const [input, cacheRead, cacheWrite, output, duration] =
    counts as (Decimal | null)[];
  let units: Decimal | null = null;
  if (u.units !== undefined && u.units !== null) {
    units = parseDecimal(u.units);
    if (units === null || isNegative(units)) {
      return null;
    }
  }

  return {
    input,
    cacheRead,
    cacheWrite,
    output,
    units,
    seconds: duration === null ? null : shift(duration, -3),
  };
}

function priceLines(rates: ParsedRates, usage: ParsedUsage): PriceLine[] {
  const lines: PriceLine[] = [];
  const line = (
    dimension: PricingDimension,
    rate: Decimal | null,
    quantity: Decimal | null,
    rateSource: PriceLine['rateSource'] = 'OWN',
  ) => {
    if (rate === null || quantity === null) {
      return;
    }
    lines.push({
      dimension,
      quantity: toDecimalString(quantity),
      rate: toDecimalString(rate),
      rateSource,
      credits: toDecimalString(multiply(rate, quantity)),
    });
  };
  const source = (own: Decimal | null): PriceLine['rateSource'] =>
    own === null ? 'INPUT_FALLBACK' : 'OWN';

  line('REQUEST', rates.REQUEST, ONE);
  line('INPUT_TOKEN', rates.INPUT_TOKEN, usage.input);
  line(
    'CACHE_READ_TOKEN',
    rates.CACHE_READ_TOKEN ?? rates.INPUT_TOKEN,
    usage.cacheRead,
    source(rates.CACHE_READ_TOKEN),
  );
  line(
    'CACHE_WRITE_TOKEN',
    rates.CACHE_WRITE_TOKEN ?? rates.INPUT_TOKEN,
    usage.cacheWrite,
    source(rates.CACHE_WRITE_TOKEN),
  );
  line('OUTPUT_TOKEN', rates.OUTPUT_TOKEN, usage.output);
  line('UNIT', rates.UNIT, usage.units);
  line('SECOND', rates.SECOND, usage.seconds);

  return lines;
}

/**
 * Prices one usage as the server does: the vector over present quantities
 * (a reported zero is present; a null rate is absent, an explicit 0 is free;
 * null cache rates fall back to the input rate), the minimum when nothing is
 * present, then the policy, then max(computed, minimum) and the maximum, then
 * half-up rounding to 6 decimals.
 */
export function priceUsage(
  terms: PricingTerms,
  usage: AiUsage | undefined,
  status: AiRequestStatus = 'SUCCESS',
): PriceOutcome {
  const parsed = parsePricingTerms(terms);
  if ('error' in parsed) {
    return { ok: false, error: parsed.error };
  }
  const quantities = parseUsage(usage);
  if (quantities === null) {
    return { ok: false, error: 'INVALID_USAGE' };
  }
  if (!STATUSES.includes(status)) {
    return { ok: false, error: 'INVALID_STATUS' };
  }
  const lines = priceLines(parsed.rates, quantities);
  const missingInput = lines.length === 0;
  const computed = missingInput
    ? parsed.minimum
    : lines.reduce<Decimal>(
        (sum, item) => add(sum, parseDecimal(item.credits) ?? ZERO),
        ZERO,
      );
  const chargeable = isChargeable(terms.chargeOnError, status);
  let charged = ZERO;
  let clamp: Priced['clamp'] = null;
  if (chargeable) {
    charged = maxOf(computed, parsed.minimum);
    if (parsed.maximum !== null) {
      charged = minOf(charged, parsed.maximum);
    }
    const moved = compare(charged, computed);
    clamp = moved > 0 ? 'MINIMUM' : moved < 0 ? 'MAXIMUM' : null;
  }

  return {
    ok: true,
    lines,
    exactComputed: toDecimalString(computed),
    computed: toDecimalString(round(computed, CREDIT_PLACES)),
    charged: toDecimalString(round(charged, CREDIT_PLACES)),
    chargeable,
    clamp,
    missingInput,
    warnings: missingInput ? ['CONVERSION_INPUT_MISSING'] : [],
  };
}

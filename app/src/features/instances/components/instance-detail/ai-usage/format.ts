import { formatNumber } from '@/lib/format-date';

const ABSENT = '—';

/**
 * Credits as stored: two decimals at least, up to the six of the credit
 * quantum, so that a receipt shows the exact stored amount. A true zero never
 * reads as negative, and an absent amount stays distinct from zero.
 */
export function formatCredits(value?: string | number | null) {
  if (value == null || value === '') {
    return ABSENT;
  }
  const credits = Number(value);

  return formatNumber(credits === 0 ? 0 : credits, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

/** A whole number of credits (an included limit, a daily pace). */
export function formatWholeCredits(value: number) {
  return formatNumber(Math.round(value), { maximumFractionDigits: 0 });
}

/** USD with the significant decimals of a per-call cost (up to six). */
export function formatUsd(value?: string | null) {
  if (value == null) {
    return ABSENT;
  }
  const amount = Number(value);
  const small = Math.abs(amount) < 0.01 && amount !== 0;

  return formatNumber(amount, {
    currency: 'USD',
    maximumFractionDigits: small ? 6 : 4,
    minimumFractionDigits: small ? 4 : 2,
    style: 'currency',
  });
}

/** A fraction (`"0.25"`) as a percentage with at most one decimal. */
export function formatFraction(value?: string | number | null) {
  if (value == null) {
    return ABSENT;
  }

  return formatNumber(Number(value), {
    maximumFractionDigits: 1,
    style: 'percent',
  });
}

/** A rate as typed in the rule (up to ten decimals), with group separators. */
export function formatRate(value?: string | null) {
  if (value == null) {
    return ABSENT;
  }

  return formatNumber(Number(value), { maximumFractionDigits: 10 });
}

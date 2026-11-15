import {
  compare,
  isPositive,
  parseDecimal,
  subtract,
  toDecimalString,
  ZERO,
} from './decimal';

/**
 * The arithmetic of a refund and of a vendor-cost comparison, on the decimal
 * strings the API stores. A refund gives credits back to the pool; the charge
 * itself is never rewritten, so what is left to refund is always
 * `charged − refunded`.
 */

type RefundableCredits = { charged?: string | null; refunded?: string | null };

/** `left − right` as a canonical decimal string, or null when either is not one. */
export function subtractDecimals(
  left: string | null | undefined,
  right: string | null | undefined,
): string | null {
  const a = parseDecimal(left);
  const b = parseDecimal(right);

  return a && b ? toDecimalString(subtract(a, b)) : null;
}

/** What an inference still has to give back: charged minus refunded, never below zero. */
export function refundableCredits(credits: RefundableCredits): string {
  const charged = parseDecimal(credits.charged) ?? ZERO;
  const refunded = parseDecimal(credits.refunded) ?? ZERO;
  const left = subtract(charged, refunded);

  return isPositive(left) ? toDecimalString(left) : '0';
}

/**
 * The API's own rule for a refund's amount (`creditsPattern` of the Go use
 * case): at most 12 integer and 6 fractional digits, as written.
 */
const REFUND_AMOUNT = /^[0-9]{1,12}(\.[0-9]{1,6})?$/;

/**
 * The amount as it is sent: canonical (`"1.5000000"` is `"1.5"`, `"08"` is
 * `"8"`), so that what the API counts as written is what the value needs. Null
 * when it is not a decimal, or one the API's rule refuses once canonical.
 */
export function normalizeRefundAmount(amount: string): string | null {
  const value = parseDecimal(amount);
  if (!value) {
    return null;
  }
  const text = toDecimalString(value);

  return REFUND_AMOUNT.test(text) ? text : null;
}

export type RefundAmountIssue =
  /** Not a positive decimal of at most 12 integer and 6 fractional digits. */
  | 'INVALID'
  /** More than what is left to refund. */
  | 'EXCEEDS';

/** Why an amount cannot be refunded, or null when it can. */
export function refundAmountIssue(
  amount: string,
  refundable: string,
): RefundAmountIssue | null {
  const value = parseDecimal(normalizeRefundAmount(amount));
  const left = parseDecimal(refundable);
  if (!value || !left || !isPositive(value)) {
    return 'INVALID';
  }

  return compare(value, left) > 0 ? 'EXCEEDS' : null;
}

/**
 * How far the vendor cost the caller reported is from the one the catalogue
 * computes (`reported − computed`, USD); null unless both are stored and differ.
 */
export function vendorCostDrift(
  reported: string | null | undefined,
  computed: string | null | undefined,
): string | null {
  const drift = subtractDecimals(reported, computed);

  return drift === null || drift === '0' ? null : drift;
}

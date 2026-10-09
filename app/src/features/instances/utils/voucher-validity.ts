import type { Validity } from '@/api-client';

// Written out in full, so that a key that does not exist fails the check of the keys.
const REASON_KEYS = {
  ALREADY_REDEEMED:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Reasons.ALREADY_REDEEMED',
  CURRENCY_MISMATCH:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Reasons.CURRENCY_MISMATCH',
  EXHAUSTED:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Reasons.EXHAUSTED',
  EXPIRED: 'Pages.Customers.Instances.Detail.Billing.Vouchers.Reasons.EXPIRED',
  NOT_ACTIVE:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Reasons.NOT_ACTIVE',
  NOT_ELIGIBLE:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Reasons.NOT_ELIGIBLE',
  NOT_FOUND:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Reasons.NOT_FOUND',
  NOT_YET_VALID:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Reasons.NOT_YET_VALID',
} as const satisfies Record<NonNullable<Validity['reason']>, string>;

const RULE_KEYS = {
  ADDON_NOT_APPLICABLE:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Rules.ADDON_NOT_APPLICABLE',
  ANNUAL_ONLY:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Rules.ANNUAL_ONLY',
  FIRST_TIME_ONLY:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Rules.FIRST_TIME_ONLY',
  LICENSE_NOT_APPLICABLE:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Rules.LICENSE_NOT_APPLICABLE',
  MINIMUM_SUBSCRIPTION_AMOUNT:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Rules.MINIMUM_SUBSCRIPTION_AMOUNT',
  NOTHING_TO_BOOST:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Rules.NOTHING_TO_BOOST',
  RESTRICTED_CUSTOMER:
    'Pages.Customers.Instances.Detail.Billing.Vouchers.Rules.RESTRICTED_CUSTOMER',
} as const satisfies Record<NonNullable<Validity['rule']>, string>;

/**
 * The key of the sentence that says why a code cannot be redeemed by this instance. The
 * API names the first check that failed (`reason`), and, for an instance that does not
 * meet the voucher, the rule it breaks (`rule`): the rule is the more useful of the two,
 * so it is the one said when there is one. Nothing is said of a valid code, and a refusal
 * the console does not know says the generic reason.
 */
export function getValidityReasonKey(
  validity: Pick<Validity, 'reason' | 'rule'>,
): string | null {
  if (validity.reason === 'NOT_ELIGIBLE' && validity.rule) {
    return RULE_KEYS[validity.rule] ?? REASON_KEYS.NOT_ELIGIBLE;
  }

  return validity.reason
    ? (REASON_KEYS[validity.reason] ?? REASON_KEYS.NOT_ELIGIBLE)
    : null;
}

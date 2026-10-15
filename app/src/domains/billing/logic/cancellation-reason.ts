// What Kaiten writes as the reason of a cancellation it makes on its own, as the API
// stores it: a reserved code. Any other reason is the free text a vendor or a customer
// gave when they canceled (at most 500 characters), and is shown as it was written.
const RESERVED_REASON_KEYS = {
  INCOMPLETE_EXPIRED: 'Features.Billing.CancellationReasons.INCOMPLETE_EXPIRED',
  TRIAL_ENDED_WITHOUT_PAYMENT_METHOD:
    'Features.Billing.CancellationReasons.TRIAL_ENDED_WITHOUT_PAYMENT_METHOD',
} as const;

/**
 * The translation key of a cancellation reason Kaiten wrote itself, or nothing for a
 * reason a person wrote, which has no translation and is shown as it is. A code the
 * console does not know yet is one of those: the raw text is better than a blank.
 */
export function getCancellationReasonLabelKey(
  reason: string,
):
  | (typeof RESERVED_REASON_KEYS)[keyof typeof RESERVED_REASON_KEYS]
  | undefined {
  return Object.hasOwn(RESERVED_REASON_KEYS, reason)
    ? RESERVED_REASON_KEYS[reason as keyof typeof RESERVED_REASON_KEYS]
    : undefined;
}

import { isApiError, isProblem } from '@/lib/errors';

/**
 * What stands between a charge and another refund of it, kept for as long as
 * the page lives so that closing the dialog, or the receipt, does not lose it.
 *
 * `UNANSWERED`: a refund was sent under `key` and no definitive answer came
 * back, so it may have gone through. Only that same request may be sent again
 * (the API answers the first refund and moves nothing): its amount and reason
 * are frozen until the API answers.
 *
 * `UNREAD`: the API said the key holds another refund, so an earlier one
 * probably went through, and the row has not been read again since. Nothing
 * may be sent before it is.
 */
export type RefundBody = { credits: string; reason: string | undefined };

export type RefundHold =
  | { kind: 'UNANSWERED'; key: string; body: RefundBody }
  | { kind: 'UNREAD' };

type RefundTarget = {
  instanceSlug: string;
  entitlementSlug: string;
  transactionId: string;
};

const holds = new Map<string, RefundHold>();

const idOf = (target: RefundTarget) =>
  [target.instanceSlug, target.entitlementSlug, target.transactionId].join('/');

export function heldRefund(target: RefundTarget): RefundHold | null {
  return holds.get(idOf(target)) ?? null;
}

/** Keeps `hold` for the charge, or lifts the one it has when `hold` is null. */
export function holdRefund(target: RefundTarget, hold: RefundHold | null) {
  if (hold) {
    holds.set(idOf(target), hold);
  } else {
    holds.delete(idOf(target));
  }
}

export function clearRefundHoldsForTest() {
  holds.clear();
}

const REQUEST_TIMEOUT = 408;

/**
 * Whether the API itself answered the request with a refusal: a problem
 * document on a 4xx. Then nothing was written under the key. Anything else (no
 * response, a timeout, a 5xx, a refusal by something on the way) leaves the
 * refund's fate unknown.
 */
export function isDefinitiveRefusal(error: unknown): boolean {
  return (
    isApiError(error) &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== REQUEST_TIMEOUT &&
    isProblem(error.data)
  );
}

import type { Invoice } from '@/api-client';
import { isAwaitingFinalization } from '@/domains/billing';

/** How often the invoice is read again while a push the person asked for is running. */
export const PUSH_POLL_INTERVAL_MS = 5_000;

/** How long it is read again for: past it the push is left to its queue, and the page says so. */
export const PUSH_POLL_WINDOW_MS = 2 * 60_000;

/**
 * A push the person asked for: how many attempts the invoice had when they did, and
 * when they did. The push itself is the queue's, so the page can only watch for its
 * result.
 */
export type PushWatch = {
  attempts: number;
  startedAt: number;
};

export function startPushWatch(
  invoice: Pick<Invoice, 'provider'>,
  now: number = Date.now(),
): PushWatch {
  return { attempts: invoice.provider?.pushAttempts ?? 0, startedAt: now };
}

/**
 * Whether the push has had its turn. The invoice waits in the queue as a DRAFT, or as
 * a PUSH_FAILED one, until the queue runs it; after that:
 * - it is pushed, and the status moved on;
 * - the provider created it and waits for a person to finalize it;
 * - or the push ran and failed again, which counts one more attempt.
 */
export function hasPushSettled(
  invoice: Pick<Invoice, 'provider' | 'status'>,
  watch: PushWatch,
): boolean {
  if (invoice.status !== 'DRAFT' && invoice.status !== 'PUSH_FAILED') {
    return true;
  }
  if (isAwaitingFinalization(invoice)) {
    return true;
  }

  return (invoice.provider?.pushAttempts ?? 0) > watch.attempts;
}

/**
 * When to read the invoice again: after the interval, while the push has not had its
 * turn and the window has not run out; never otherwise.
 */
export function getPushPollDelay(
  invoice: Pick<Invoice, 'provider' | 'status'> | undefined,
  watch: PushWatch | null,
  now: number,
): number | false {
  if (!watch || !invoice) {
    return false;
  }
  if (now - watch.startedAt >= PUSH_POLL_WINDOW_MS) {
    return false;
  }

  return hasPushSettled(invoice, watch) ? false : PUSH_POLL_INTERVAL_MS;
}

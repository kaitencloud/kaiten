import { useMemo, useRef } from 'react';

/** How long the deliveries are read again after a resend, and how often. */
const WATCH_WINDOW_MS = 15_000;
const WATCH_INTERVAL_MS = 3_000;

export interface DeliveryWatch {
  /** Opens the window; call it before the resend's refetch settles. */
  arm: () => void;
  /** For `refetchInterval`: 3 s while the window is open, then nothing. */
  refetchInterval: () => number | false;
}

/**
 * A bounded watch for the attempt a resend queues: it shows as sending for a
 * few seconds, then settles. React Query evaluates a function interval when
 * the options are set and after each fetch settles, so `arm` must run before
 * the refetch that follows the resend settles, or polling never starts. The
 * window is a ref: nothing renders from it.
 */
export function useDeliveryWatch(): DeliveryWatch {
  const until = useRef(0);

  return useMemo(
    () => ({
      arm: () => {
        until.current = Date.now() + WATCH_WINDOW_MS;
      },
      refetchInterval: () =>
        Date.now() < until.current ? WATCH_INTERVAL_MS : false,
    }),
    [],
  );
}

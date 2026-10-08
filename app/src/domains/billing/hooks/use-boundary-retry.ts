import { useCallback, useEffect, useRef, useState } from 'react';
import { handleBillingProblem } from '../logic';

/**
 * How a screen sends a request that billing refuses while a period is being
 * closed (409 `*.BoundaryPending`): the subscription's period has ended and its
 * close has not run, so a change would land before or after the boundary
 * depending on how late the close is. Nothing was changed, and a minute later
 * the close has run.
 *
 * `send` makes the request. When the API says the boundary is pending it waits
 * for the time the answer names (a minute when it names none: the stack does not
 * send `Retry-After`) and makes the very same request once more, with the same
 * variables since it is the same closure. `closing` is true during the wait, for
 * the screen to say so instead of showing an error. If that second try fails,
 * whatever the reason, the failure is thrown for the screen to show, with a
 * retry of its own: a person who presses it starts a new `send`, with a new
 * automatic retry. A refusal that is not a pending boundary is thrown at once.
 *
 * Leaving the screen during the wait drops the retry: nobody is looking at the
 * outcome any more, and a request nobody asked for again is not sent.
 */
export function useBoundaryRetry() {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abandon = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      abandon.current?.();
    },
    [],
  );

  const send = useCallback(async <T>(request: () => Promise<T>): Promise<T> => {
    try {
      return await request();
    } catch (error) {
      const problem = handleBillingProblem(error);

      if (problem.kind !== 'boundary-pending') {
        throw error;
      }
      setClosing(true);
      const resumed = await new Promise<boolean>((resolve) => {
        abandon.current = () => resolve(false);
        timer.current = setTimeout(() => resolve(true), problem.retryAfterMs);
      });
      abandon.current = null;
      if (!resumed) {
        throw error;
      }
      setClosing(false);

      return await request();
    }
  }, []);

  return { closing, send };
}

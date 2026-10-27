import type { UseMutateAsyncFunction } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

/**
 * Lets an action run once at a time. A button guarded by `disabled={isPending}`
 * is guarded by what was painted: the state of a mutation reaches the screen a
 * frame after the click, so two clicks of the same frame both go through. This
 * guard is a ref set before the action starts, so the second click finds it
 * taken. Keep `disabled` on the button as well: it is what the person sees.
 *
 * The action owns its failures, as an event handler does: a rejection reaches
 * the caller after the guard is released, and the caller `void`s the call.
 * Calls made while the action runs are dropped, not queued.
 */
export function useSingleFlight<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown>,
): (...args: Args) => Promise<void> {
  const running = useRef(false);

  return useCallback(
    async (...args: Args) => {
      if (running.current) {
        return;
      }
      running.current = true;
      try {
        await action(...args);
      } finally {
        running.current = false;
      }
    },
    [action],
  );
}

/**
 * The same guard for a mutation, fired as `mutate` does it: a second call made
 * while the first is out is dropped, and the guard is released when the
 * mutation settles, whatever it answers. The refusal stays the mutation's own
 * (`onError`, `error`).
 *
 * It takes `mutateAsync` and releases from the promise, not from a callback given
 * to `mutate`: TanStack Query drops the callbacks of a call when the same mutation
 * is fired again or reset, which would leave the guard taken for good and the
 * button dead. The promise settles however the mutation is used meanwhile.
 */
export function useSingleFlightMutate<TData, TError, TVariables, TContext>(
  mutateAsync: UseMutateAsyncFunction<TData, TError, TVariables, TContext>,
): (variables: TVariables) => void {
  const running = useRef(false);

  return useCallback(
    (variables: TVariables) => {
      if (running.current) {
        return;
      }
      running.current = true;
      mutateAsync(variables)
        .catch(() => {
          // The mutation reports its failure itself (`onError`, `error`).
        })
        .finally(() => {
          running.current = false;
        });
    },
    [mutateAsync],
  );
}

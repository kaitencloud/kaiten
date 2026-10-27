export type DebouncedFunction<Args extends unknown[]> = ((
  ...args: Args
) => void) & {
  cancel: () => void;
  /** Runs the pending invocation now, if there is one. */
  flush: () => void;
};

/**
 * Trailing-edge debounce with `cancel()` and `flush()` escape hatches — the
 * only lodash surface the app used. Cancelling drops the pending invocation;
 * flushing runs it at once, for a caller that must not lose it (a page that
 * is being hidden).
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): DebouncedFunction<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: Args | undefined;

  const debounced = (...args: Args) => {
    clearTimeout(timer);
    pendingArgs = args;
    timer = setTimeout(() => {
      timer = undefined;
      pendingArgs = undefined;
      fn(...args);
    }, delayMs);
  };

  debounced.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    pendingArgs = undefined;
  };

  debounced.flush = () => {
    if (timer === undefined || pendingArgs === undefined) {
      return;
    }

    const args = pendingArgs;
    clearTimeout(timer);
    timer = undefined;
    pendingArgs = undefined;
    fn(...args);
  };

  return debounced;
}

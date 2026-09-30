export type DebouncedFunction<Args extends unknown[]> = ((
  ...args: Args
) => void) & {
  cancel: () => void;
};

/**
 * Trailing-edge debounce with a `cancel()` escape hatch — the only lodash
 * surface the app used. Cancelling drops the pending invocation.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): DebouncedFunction<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: Args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delayMs);
  };

  debounced.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  return debounced;
}

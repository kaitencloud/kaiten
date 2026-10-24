import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { debounce } from '../debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes once with the last arguments after the delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    debounced('b');
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('cancel() drops the pending invocation', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    debounced.cancel();
    vi.advanceTimersByTime(200);

    expect(fn).not.toHaveBeenCalled();
  });

  it('restarts the delay on each call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    vi.advanceTimersByTime(60);
    debounced('b');
    vi.advanceTimersByTime(60);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(40);
    expect(fn).toHaveBeenCalledExactlyOnceWith('b');
  });

  it('flush() runs the pending invocation at once, with the last arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    debounced('b');
    debounced.flush();

    expect(fn).toHaveBeenCalledExactlyOnceWith('b');

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush() does nothing when nothing is pending', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced.flush();
    debounced('a');
    vi.advanceTimersByTime(100);
    debounced.flush();

    expect(fn).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('flush() after cancel() does nothing', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    debounced.cancel();
    debounced.flush();

    expect(fn).not.toHaveBeenCalled();
  });
});

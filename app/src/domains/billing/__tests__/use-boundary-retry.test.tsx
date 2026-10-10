import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import { useBoundaryRetry } from '../hooks';

const pending = (retryAfter?: string) =>
  new ApiError({
    data: {
      code: 'CancelSubscription.BoundaryPending',
      detail: 'the period has ended and is being closed; retry in a minute',
      status: 409,
    },
    response: new Response(null, {
      headers: retryAfter ? { 'Retry-After': retryAfter } : {},
      status: 409,
    }),
    status: 409,
  });

const refused = new ApiError({
  data: { code: 'CancelSubscription.NotActive', detail: 'it is canceled', status: 409 },
  status: 409,
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useBoundaryRetry', () => {
  it('sends the request once and returns its answer when nothing is pending', async () => {
    const { result } = renderHook(() => useBoundaryRetry());
    const request = vi.fn().mockResolvedValue('done');

    await expect(result.current.send(request)).resolves.toBe('done');

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.closing).toBe(false);
  });

  it('waits a minute when the API names none, says so, and sends the same request again', async () => {
    const { result } = renderHook(() => useBoundaryRetry());
    const request = vi
      .fn()
      .mockRejectedValueOnce(pending())
      .mockResolvedValueOnce('done');

    let outcome: Promise<string> | undefined;
    await act(async () => {
      outcome = result.current.send(request);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.closing).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    await expect(outcome).resolves.toBe('done');
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.closing).toBe(false);
  });

  it('waits what Retry-After says when the API says it', async () => {
    const { result } = renderHook(() => useBoundaryRetry());
    const request = vi
      .fn()
      .mockRejectedValueOnce(pending('5'))
      .mockResolvedValueOnce('done');

    let outcome: Promise<string> | undefined;
    await act(async () => {
      outcome = result.current.send(request);
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    await expect(outcome).resolves.toBe('done');
  });

  it('retries once only: a second refusal is thrown for the screen to show, whatever it is', async () => {
    const { result } = renderHook(() => useBoundaryRetry());
    const second = pending();
    const request = vi
      .fn()
      .mockRejectedValueOnce(pending())
      .mockRejectedValueOnce(second);

    let outcome: Promise<unknown> | undefined;
    await act(async () => {
      outcome = result.current.send(request).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(60_000);
    });

    await expect(outcome).resolves.toBe(second);
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.closing).toBe(false);
  });

  it('sends again with a retry of its own when a person presses retry after that', async () => {
    const { result } = renderHook(() => useBoundaryRetry());
    const request = vi
      .fn()
      .mockRejectedValueOnce(pending())
      .mockRejectedValueOnce(pending())
      .mockResolvedValueOnce('done');

    await act(async () => {
      const first = result.current.send(request).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(60_000);
      await first;
    });
    expect(request).toHaveBeenCalledTimes(2);

    await expect(result.current.send(request)).resolves.toBe('done');
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('throws at once what is not a period being closed, with no wait', async () => {
    const { result } = renderHook(() => useBoundaryRetry());
    const request = vi.fn().mockRejectedValue(refused);

    await expect(result.current.send(request)).rejects.toBe(refused);

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.closing).toBe(false);
  });

  it('drops the retry when the screen is left during the wait: nobody is looking at the outcome', async () => {
    const { result, unmount } = renderHook(() => useBoundaryRetry());
    const first = pending();
    const request = vi.fn().mockRejectedValue(first);

    let outcome: Promise<unknown> | undefined;
    await act(async () => {
      outcome = result.current.send(request).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(10_000);
    });
    unmount();
    await vi.advanceTimersByTimeAsync(120_000);

    await expect(outcome).resolves.toBe(first);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

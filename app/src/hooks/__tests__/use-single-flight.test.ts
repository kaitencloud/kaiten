import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { useSingleFlight, useSingleFlightMutate } from '../use-single-flight';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });

  return { promise, reject, resolve };
}

describe('useSingleFlight', () => {
  it('runs the action once for calls made before it settles, whatever the renders in between', async () => {
    const flight = deferred();
    const action = vi.fn(() => flight.promise);
    const { result, rerender } = renderHook(() => useSingleFlight(action));

    void result.current();
    rerender();
    void result.current();
    void result.current();

    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => {
      flight.resolve();
      await flight.promise;
    });
  });

  it('runs it again once it settled', async () => {
    const action = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useSingleFlight(action));

    await act(() => result.current());
    await act(() => result.current());

    expect(action).toHaveBeenCalledTimes(2);
  });

  it('lets the rejection reach the caller, and runs again after it', async () => {
    const action = vi
      .fn<(value: number) => Promise<void>>()
      .mockRejectedValueOnce(new Error('refused'))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useSingleFlight(action));

    await expect(result.current(1)).rejects.toThrow('refused');
    await act(() => result.current(2));

    expect(action.mock.calls).toEqual([[1], [2]]);
  });
});

describe('useSingleFlightMutate', () => {
  it('sends the first call and drops the ones made before the mutation settles', () => {
    const mutate = vi.fn();
    const { result } = renderHook(() => useSingleFlightMutate(mutate));

    result.current({ id: 1 });
    result.current({ id: 2 });

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ id: 1 });
  });

  it('sends again once the mutation settled, answered or refused', () => {
    const mutate = vi.fn();
    const { result } = renderHook(() => useSingleFlightMutate(mutate));

    result.current('first');
    mutate.mock.calls[0][1].onSettled();
    result.current('second');
    mutate.mock.calls[1][1].onSettled();
    result.current('third');

    expect(mutate.mock.calls.map(([variables]) => variables)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });
});

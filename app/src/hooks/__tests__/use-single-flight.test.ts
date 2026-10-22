import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
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
  it('sends the first call and drops the ones made before the mutation settles', async () => {
    const flight = deferred();
    const mutateAsync = vi.fn(() => flight.promise);
    const { result } = renderHook(() => useSingleFlightMutate(mutateAsync));

    result.current({ id: 1 });
    result.current({ id: 2 });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ id: 1 });
    await act(async () => {
      flight.resolve();
      await flight.promise;
    });
  });

  it('sends again once the mutation settled, answered or refused', async () => {
    const mutateAsync = vi
      .fn<(variables: string) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('refused'))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useSingleFlightMutate(mutateAsync));

    await act(async () => result.current('first'));
    await act(async () => result.current('second'));
    await act(async () => result.current('third'));

    expect(mutateAsync.mock.calls.map(([variables]) => variables)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('lets go of the guard when its mutation is fired again by another caller meanwhile', async () => {
    // What a callback given to `mutate` would not survive: TanStack Query drops the callbacks of
    // a call when the same mutation is fired again, and the button would stay dead.
    const flights: Array<ReturnType<typeof deferred>> = [];
    const mutationFn = vi.fn((_: string) => {
      const flight = deferred();
      flights.push(flight);

      return flight.promise;
    });
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(
      () => {
        const mutation = useMutation({ mutationFn });

        return { mutation, once: useSingleFlightMutate(mutation.mutateAsync) };
      },
      { wrapper },
    );

    act(() => result.current.once('guarded'));
    act(() => result.current.mutation.mutate('other'));
    const tick = () => act(() => new Promise((done) => setTimeout(done, 0)));
    // The library starts the requests a tick after the calls.
    await tick();
    flights.forEach((flight) => flight.resolve());
    await tick();
    act(() => result.current.once('again'));
    await tick();

    expect(mutationFn.mock.calls.map(([variables]) => variables)).toEqual([
      'guarded',
      'other',
      'again',
    ]);
  });
});

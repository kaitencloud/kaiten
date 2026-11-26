import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useDeliveryWatch } from '../use-delivery-watch';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDeliveryWatch', () => {
  it('polls every 3 s for 15 s once armed, and not before', () => {
    const { result } = renderHook(() => useDeliveryWatch());

    expect(result.current.refetchInterval()).toBe(false);
    result.current.arm();
    expect(result.current.refetchInterval()).toBe(3000);
    vi.advanceTimersByTime(14_000);
    expect(result.current.refetchInterval()).toBe(3000);
    vi.advanceTimersByTime(1_001);
    expect(result.current.refetchInterval()).toBe(false);
  });

  it('keeps reading a query after the refetch that follows the arming', async () => {
    const queryClient = new QueryClient();
    const queryFn = vi.fn(async () => queryFn.mock.calls.length);
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }
    const { result } = renderHook(
      () => {
        const watch = useDeliveryWatch();
        useQuery({
          queryKey: ['webhooks', 'messages', 'ep_orders', 'msg_1'],
          queryFn,
          refetchInterval: watch.refetchInterval,
        });
        return watch;
      },
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

    // What a resend does: arm first, then invalidate.
    result.current.arm();
    await act(() => queryClient.invalidateQueries());
    expect(queryFn).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(queryFn).toHaveBeenCalledTimes(3);

    await act(() => vi.advanceTimersByTimeAsync(30_000));
    const settled = queryFn.mock.calls.length;
    expect(settled).toBeLessThanOrEqual(8);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(queryFn).toHaveBeenCalledTimes(settled);
  });
});

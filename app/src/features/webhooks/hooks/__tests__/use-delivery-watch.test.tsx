import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  webhookMessageQueryOptions,
  webhookMessagesQueryOptions,
} from '../../queries';
import type {
  WebhookDeliveryStatus,
  WebhookMessage,
  WebhookMessageList,
} from '../../types';
import {
  type DeliveryWatchTarget,
  useDeliveryWatch,
  WATCH_CAP_MS,
  WATCH_INTERVAL_MS,
} from '../use-delivery-watch';

const target: DeliveryWatchTarget = {
  webhookId: 'ep_orders',
  messageId: 'msg_1',
  latestKnownAttempt: { id: 'atmpt_1', timestamp: '2026-11-26T09:00:00Z' },
};

const emptyList: WebhookMessageList = {
  webhook: {
    id: 'ep_orders',
    url: 'https://api.example.com/hooks',
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-01T09:00:00Z',
  },
  messages: [],
  summary: { total: 0, delivered: 0, failed: 0, pending: 0 },
  hasMore: false,
};

/**
 * The message with its known failed attempt, then the resend's, if any, and
 * an older failed attempt the detail never knew when `withOlder` is set.
 */
function messageWith(
  resent?: WebhookDeliveryStatus,
  { withOlder = false }: { withOlder?: boolean } = {},
): WebhookMessage {
  return {
    messageId: 'msg_1',
    payloadAvailable: true,
    payload: { id: 'evt_1' },
    attempts: [
      ...(resent
        ? [
            {
              id: 'atmpt_2',
              timestamp: '2026-11-26T10:00:00Z',
              status: resent,
              triggerType: 'manual' as const,
            },
          ]
        : []),
      {
        id: 'atmpt_1',
        timestamp: '2026-11-26T09:00:00Z',
        status: 'fail',
        triggerType: 'scheduled',
      },
      ...(withOlder
        ? [
            {
              id: 'atmpt_0',
              timestamp: '2026-11-26T08:00:00Z',
              status: 'fail' as const,
              triggerType: 'scheduled' as const,
            },
          ]
        : []),
    ],
  };
}

/**
 * The watch beside two queries on screen: the row's list (as the deliveries
 * cell reads it) and the watched message, whose answer `readMessage` gives.
 */
function renderWatch(
  readMessage: (read: number) => WebhookMessage = () => messageWith(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const readList = vi.fn(async () => emptyList);
  let messageReads = 0;
  const readMessageFn = vi.fn(async () => readMessage(++messageReads));
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </StrictMode>
    );
  }
  const view = renderHook(
    ({ open }: { open: boolean }) => {
      useQuery({
        ...webhookMessagesQueryOptions('ep_orders', {
          limit: 20,
          withAttempts: false,
        }),
        queryFn: readList,
      });
      useQuery({
        ...webhookMessageQueryOptions('ep_orders', 'msg_1'),
        queryFn: readMessageFn,
      });
      return useDeliveryWatch({ open });
    },
    { initialProps: { open: true }, wrapper: Wrapper },
  );

  return { ...view, invalidate, readList, readMessageFn };
}

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDeliveryWatch', () => {
  it('reads nothing again before it is armed', async () => {
    const { readList } = renderWatch();
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    await advance(30_000);

    expect(readList).toHaveBeenCalledTimes(1);
  });

  it("reads the row's list again every 3 s once armed", async () => {
    const { readList, result } = renderWatch();
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(WATCH_INTERVAL_MS - 100);
    expect(readList).toHaveBeenCalledTimes(1);
    await advance(100);
    expect(readList).toHaveBeenCalledTimes(2);
    await advance(WATCH_INTERVAL_MS);
    expect(readList).toHaveBeenCalledTimes(3);
  });

  it('stops once the message shows a new attempt, settled, after one more read of the lists', async () => {
    const { readList, readMessageFn, result } = renderWatch((read) =>
      messageWith(read >= 3 ? 'success' : undefined),
    );
    await waitFor(() => expect(readMessageFn).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(2 * WATCH_INTERVAL_MS);

    expect(readMessageFn).toHaveBeenCalledTimes(3);
    // Read alongside the message, the list may predate the attempt: once more.
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(4));
    await advance(30_000);
    expect(readMessageFn).toHaveBeenCalledTimes(3);
    expect(readList).toHaveBeenCalledTimes(4);
  });

  it('keeps reading while the new attempt is still being sent', async () => {
    const { readMessageFn, result } = renderWatch(() =>
      messageWith('sending'),
    );
    await waitFor(() => expect(readMessageFn).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(5 * WATCH_INTERVAL_MS);

    expect(readMessageFn).toHaveBeenCalledTimes(6);
  });

  it('does not take a known attempt for the new one', async () => {
    const { readMessageFn, result } = renderWatch(() =>
      messageWith('success'),
    );
    await waitFor(() => expect(readMessageFn).toHaveBeenCalledTimes(1));

    act(() =>
      result.current.arm({
        ...target,
        latestKnownAttempt: { id: 'atmpt_2', timestamp: '2026-11-26T10:00:00Z' },
      }),
    );
    await advance(3 * WATCH_INTERVAL_MS);

    expect(readMessageFn).toHaveBeenCalledTimes(4);
  });

  it('does not take an older attempt the detail never knew for the new one', async () => {
    // Armed before the message was read: the detail knew the list's last
    // attempt only, and the message also holds an older failed one.
    const { readMessageFn, result } = renderWatch((read) =>
      messageWith(read >= 4 ? 'success' : undefined, { withOlder: true }),
    );
    await waitFor(() => expect(readMessageFn).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(3 * WATCH_INTERVAL_MS);
    expect(readMessageFn).toHaveBeenCalledTimes(4);

    await advance(30_000);
    expect(readMessageFn).toHaveBeenCalledTimes(4);
  });

  it('stops after a minute whatever the message shows', async () => {
    const { readList, result } = renderWatch();
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(WATCH_CAP_MS);
    const reads = readList.mock.calls.length;

    expect(reads).toBe(1 + WATCH_CAP_MS / WATCH_INTERVAL_MS);
    await advance(60_000);
    expect(readList).toHaveBeenCalledTimes(reads);
  });

  it('replaces the running watch when armed again', async () => {
    const { readList, result } = renderWatch();
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(2_000);
    act(() => result.current.arm(target));
    await advance(1_500);
    expect(readList).toHaveBeenCalledTimes(1);
    await advance(1_500);
    expect(readList).toHaveBeenCalledTimes(2);
    await advance(WATCH_INTERVAL_MS);
    expect(readList).toHaveBeenCalledTimes(3);
  });

  it('reads the lists and the history once more when closed after a settled resend', async () => {
    const { invalidate, readList, readMessageFn, rerender, result } =
      renderWatch((read) => messageWith(read >= 2 ? 'success' : undefined));
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(WATCH_INTERVAL_MS);
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(3));
    const before = invalidate.mock.calls.length;
    rerender({ open: false });

    expect(invalidate.mock.calls.slice(before).map(([filters]) => filters)).toEqual([
      { queryKey: ['webhooks', 'messages-list', 'ep_orders'] },
      { queryKey: ['webhooks', 'history'], exact: true },
    ]);
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(4));
    await advance(30_000);
    expect(readList).toHaveBeenCalledTimes(4);
    expect(readMessageFn).toHaveBeenCalledTimes(2);
  });

  it('keeps reading the lists, not the message, after a close until its cap', async () => {
    const { invalidate, readList, readMessageFn, rerender, result } =
      renderWatch();
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(1_000);
    const before = invalidate.mock.calls.length;
    rerender({ open: false });
    await advance(WATCH_CAP_MS);

    const after = invalidate.mock.calls.slice(before).map(([filters]) => filters);
    // The read at the close, then one per tick until the cap.
    expect(after).toHaveLength(2 * (1 + WATCH_CAP_MS / WATCH_INTERVAL_MS));
    expect(after).not.toContainEqual(
      expect.objectContaining({ queryKey: ['webhooks', 'messages', 'ep_orders', 'msg_1'] }),
    );
    expect(readMessageFn).toHaveBeenCalledTimes(1);
    const reads = readList.mock.calls.length;
    await advance(60_000);
    expect(readList).toHaveBeenCalledTimes(reads);
  });

  it('reads nothing again when closed without a resend', async () => {
    const { invalidate, readList, rerender } = renderWatch();
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    rerender({ open: false });
    rerender({ open: true });
    rerender({ open: false });
    await advance(30_000);

    expect(invalidate).not.toHaveBeenCalled();
    expect(readList).toHaveBeenCalledTimes(1);
  });

  it('reads only the lists on a tick after the owner unmounts, even one in flight', async () => {
    let answerList: (list: WebhookMessageList) => void = () => undefined;
    const { invalidate, readList, result, unmount } = renderWatch();
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));
    readList.mockImplementation(
      () =>
        new Promise((resolve) => {
          answerList = resolve;
        }),
    );

    act(() => result.current.arm(target));
    await advance(WATCH_INTERVAL_MS);
    expect(readList).toHaveBeenCalledTimes(2);
    const before = invalidate.mock.calls.length;
    unmount();
    answerList(emptyList);
    await advance(WATCH_INTERVAL_MS);

    // The reads at the unmount, then the next tick's: never the message.
    expect(invalidate.mock.calls.slice(before).map(([filters]) => filters)).toEqual([
      { queryKey: ['webhooks', 'messages-list', 'ep_orders'] },
      { queryKey: ['webhooks', 'history'], exact: true },
      { queryKey: ['webhooks', 'messages-list', 'ep_orders'] },
      { queryKey: ['webhooks', 'history'], exact: true },
    ]);
  });
});

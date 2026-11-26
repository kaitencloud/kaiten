import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  webhookHistoryQueryOptions,
  webhookMessageQueryOptions,
  webhookMessagesQueryOptions,
} from '../../queries';
import type {
  WebhookDeliveryStatus,
  WebhookDeliveryTrigger,
  WebhookHistoryResponse,
  WebhookMessage,
  WebhookMessageAttempt,
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

/** The resend's attempt, recorded after the known one. */
function resentAttempt(
  status: WebhookDeliveryStatus,
  triggerType: WebhookDeliveryTrigger = 'manual',
): WebhookMessageAttempt {
  return { id: 'atmpt_2', timestamp: '2026-11-26T10:00:00Z', status, triggerType };
}

/** The row's list, its message carrying `lastAttempt` when one is given. */
function listWith(lastAttempt?: WebhookMessageAttempt): WebhookMessageList {
  return lastAttempt
    ? {
        ...emptyList,
        messages: [
          {
            messageId: 'msg_1',
            eventType: 'com.kaiten.instance.v1.created',
            timestamp: '2026-11-26T08:59:00Z',
            status: lastAttempt.status,
            lastAttempt,
          },
        ],
      }
    : emptyList;
}

/**
 * The message with its known failed attempt, then the resend's, if any, and
 * an older failed attempt the detail never knew when `withOlder` is set.
 * `trigger` is the reason the provider gives for the attempt after the known one.
 */
function messageWith(
  resent?: WebhookDeliveryStatus,
  {
    withOlder = false,
    trigger = 'manual',
  }: { withOlder?: boolean; trigger?: WebhookDeliveryTrigger } = {},
): WebhookMessage {
  return {
    messageId: 'msg_1',
    payloadAvailable: true,
    payload: { id: 'evt_1' },
    attempts: [
      ...(resent ? [resentAttempt(resent, trigger)] : []),
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
 * The watch beside two queries: the row's list (as the deliveries cell reads
 * it), whose answer `readListAt` gives, and the watched message, whose answer
 * `readMessage` gives. The message is read only while `open`, as the dialog's
 * detail unmounts when it closes. The app's 30 s staleTime: a query shown
 * again is read only if something marked it stale.
 */
function renderWatch(
  readMessage: (read: number) => WebhookMessage = () => messageWith(),
  readListAt: (read: number) => WebhookMessageList = () => emptyList,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  let listReads = 0;
  const readList = vi.fn(async () => readListAt(++listReads));
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
        enabled: open,
      });
      return useDeliveryWatch({ open });
    },
    { initialProps: { open: true }, wrapper: Wrapper },
  );

  return { ...view, invalidate, queryClient, readList, readMessageFn };
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

  it('does not take a scheduled retry for the resend', async () => {
    // Armed on an attempt that was not the message's newest, as from the
    // History before the message is read: the retry that followed it is not
    // the resend's.
    const { readMessageFn, result } = renderWatch(() =>
      messageWith('fail', { trigger: 'scheduled' }),
    );
    await waitFor(() => expect(readMessageFn).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(3 * WATCH_INTERVAL_MS);

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

  it('keeps reading the lists, not the message off screen, after a close until its cap', async () => {
    const { readList, readMessageFn, rerender, result } = renderWatch();
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(1_000);
    rerender({ open: false });
    await advance(WATCH_CAP_MS);

    // The read at the close, then one per tick until the cap.
    expect(readList).toHaveBeenCalledTimes(
      2 + Math.floor((WATCH_CAP_MS + 1_000) / WATCH_INTERVAL_MS),
    );
    expect(readMessageFn).toHaveBeenCalledTimes(1);
    const reads = readList.mock.calls.length;
    await advance(60_000);
    expect(readList).toHaveBeenCalledTimes(reads);
  });

  it('reads the message again when it is shown again after a close', async () => {
    const { readList, readMessageFn, rerender, result } = renderWatch(
      (read) => messageWith(read >= 2 ? 'success' : undefined),
    );
    await waitFor(() => expect(readMessageFn).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(1_000);
    rerender({ open: false });
    await advance(WATCH_INTERVAL_MS);
    expect(readMessageFn).toHaveBeenCalledTimes(1);

    // Marked stale by the tick while off screen, it is read when shown.
    rerender({ open: true });
    await waitFor(() => expect(readMessageFn).toHaveBeenCalledTimes(2));
    await advance(WATCH_INTERVAL_MS);
    expect(readMessageFn).toHaveBeenCalledTimes(3);
    const reads = readList.mock.calls.length;
    await advance(30_000);
    expect(readMessageFn).toHaveBeenCalledTimes(3);
    expect(readList).toHaveBeenCalledTimes(reads);
  });

  it('ends after a close once a list shows the new attempt, settled', async () => {
    const { readList, rerender, result } = renderWatch(undefined, (read) =>
      listWith(read >= 4 ? resentAttempt('success') : undefined),
    );
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(1_000);
    // The read at the close is the second.
    rerender({ open: false });
    await advance(2 * WATCH_INTERVAL_MS);

    // The second tick's read showed it: one more read of the lists, then none.
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(5));
    await advance(30_000);
    expect(readList).toHaveBeenCalledTimes(5);
  });

  it('ends after a close once the History shows the new attempt, settled', async () => {
    const { queryClient, readList, rerender, result } = renderWatch();
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(1_000);
    rerender({ open: false });
    const history: WebhookHistoryResponse = {
      history: [
        {
          date: '2026-11-26T10:00:00Z',
          hookId: 'ep_orders',
          hookUrl: 'https://api.example.com/hooks',
          eventType: 'com.kaiten.instance.v1.created',
          status: 'success',
          messageId: 'msg_1',
          attemptId: 'atmpt_2',
          triggerType: 'manual',
        },
      ],
    };
    queryClient.setQueryData(webhookHistoryQueryOptions.queryKey, history);
    await advance(WATCH_INTERVAL_MS);

    // The close's read, the tick's, then the one that follows the end.
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(4));
    await advance(30_000);
    expect(readList).toHaveBeenCalledTimes(4);
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

  it('reads nothing off screen on a tick after the owner unmounts, even one in flight', async () => {
    let answerList: (list: WebhookMessageList) => void = () => undefined;
    const { invalidate, readList, readMessageFn, result, unmount } =
      renderWatch();
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

    // The lists at the unmount, then the next tick's queries, only marked
    // stale: nothing shows them any more, so nothing is fetched.
    expect(invalidate.mock.calls.slice(before).map(([filters]) => filters)).toEqual([
      { queryKey: ['webhooks', 'messages-list', 'ep_orders'] },
      { queryKey: ['webhooks', 'history'], exact: true },
      { queryKey: ['webhooks', 'history'], exact: true },
      { queryKey: ['webhooks', 'messages-list', 'ep_orders'] },
      { queryKey: ['webhooks', 'messages', 'ep_orders', 'msg_1'], exact: true },
    ]);
    expect(readList).toHaveBeenCalledTimes(2);
    // The one read with the first tick, before the unmount.
    expect(readMessageFn).toHaveBeenCalledTimes(2);
  });
});

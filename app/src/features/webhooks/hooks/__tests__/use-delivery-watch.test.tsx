import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
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

// The watch reads a message no query on screen shows outside the cache, with
// the API function itself: this is the provider's answer to that read.
const api = vi.hoisted(() => ({ getWebhookMessage: vi.fn() }));
vi.mock('../../webhooks.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../webhooks.api')>()),
  getWebhookMessage: api.getWebhookMessage,
}));

const KNOWN_ATTEMPT = { id: 'atmpt_1', timestamp: '2026-11-26T09:00:00Z' };

const target: DeliveryWatchTarget = {
  webhookId: 'ep_orders',
  messageId: 'msg_1',
  latestKnownAttempt: KNOWN_ATTEMPT,
};

const second: DeliveryWatchTarget = { ...target, messageId: 'msg_2' };

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
  { id = 'atmpt_2', timestamp = '2026-11-26T10:00:00Z' } = {},
): WebhookMessageAttempt {
  return { id, timestamp, status, triggerType };
}

/** The message's failed attempt the detail knows, as a list or the History shows it. */
const knownFailedAttempt: WebhookMessageAttempt = {
  ...KNOWN_ATTEMPT,
  status: 'fail',
  triggerType: 'scheduled',
};

/** A second resend's attempt, recorded after the first one. */
const secondResentAttempt = resentAttempt('success', 'manual', {
  id: 'atmpt_3',
  timestamp: '2026-11-26T10:05:00Z',
});

/** A list holding msg_1, carrying `lastAttempt` when one is given. */
function listWith(lastAttempt?: WebhookMessageAttempt): WebhookMessageList {
  return {
    ...emptyList,
    messages: [
      {
        messageId: 'msg_1',
        eventType: 'com.kaiten.instance.v1.created',
        timestamp: '2026-11-26T08:59:00Z',
        status: lastAttempt?.status ?? 'fail',
        ...(lastAttempt ? { lastAttempt } : {}),
      },
    ],
  };
}

/**
 * The message with its known failed attempt, then the resend's, if any, and
 * an older failed attempt the detail never knew when `withOlder` is set.
 * `trigger` is the reason the provider gives for the attempt after the known
 * one, and `also` adds further attempts.
 */
function messageWith(
  resent?: WebhookDeliveryStatus,
  {
    withOlder = false,
    trigger = 'manual',
    also = [],
  }: {
    withOlder?: boolean;
    trigger?: WebhookDeliveryTrigger;
    also?: WebhookMessageAttempt[];
  } = {},
): WebhookMessage {
  return {
    messageId: 'msg_1',
    payloadAvailable: true,
    payload: { id: 'evt_1' },
    attempts: [
      ...also,
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

type ReadMessage = (read: number) => WebhookMessage;

interface RenderOptions {
  /** The provider's answer to each message's n-th read, by message id. */
  messages?: Record<string, ReadMessage>;
  /** The provider's answer to the n-th read of the list. */
  readListAt?: (read: number) => WebhookMessageList;
  /** Whether the list on screen is read with attempts, as the dialog's is. */
  listWithAttempts?: boolean;
}

/**
 * The watch beside a list on screen (the row's, read without attempts, unless
 * `listWithAttempts`) and the query of each message, as a dialog's detail
 * reads it: only while `open`, as the detail unmounts when the dialog closes.
 * The provider counts each message's reads, through the cache or outside it,
 * so `messages` answers by the n-th read the provider sees. The app's 30 s
 * staleTime: a query shown again is read only if something marked it stale.
 */
function renderWatch({
  messages = { msg_1: () => messageWith() },
  readListAt = () => emptyList,
  listWithAttempts = false,
}: RenderOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const providerReads: Record<string, number> = {};
  const answer = (messageId: string) => {
    providerReads[messageId] = (providerReads[messageId] ?? 0) + 1;
    return messages[messageId](providerReads[messageId]);
  };
  let listReads = 0;
  const readList = vi.fn(async () => readListAt(++listReads));
  const readMessageFn = vi.fn(async (messageId: string) => answer(messageId));
  api.getWebhookMessage.mockImplementation(
    async (_webhookId: string, messageId: string) => answer(messageId),
  );
  const ids = Object.keys(messages);
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </StrictMode>
    );
  }
  function useMessage(messageId: string, open: boolean) {
    useQuery({
      ...webhookMessageQueryOptions('ep_orders', messageId),
      queryFn: () => readMessageFn(messageId),
      enabled: open,
    });
  }
  const view = renderHook(
    ({ open }: { open: boolean }) => {
      useQuery({
        ...webhookMessagesQueryOptions('ep_orders', {
          limit: 20,
          withAttempts: listWithAttempts,
        }),
        queryFn: readList,
      });
      useMessage(ids[0], open);
      useMessage(ids[1] ?? ids[0], open);
      return useDeliveryWatch({ open });
    },
    { initialProps: { open: true }, wrapper: Wrapper },
  );
  const cacheReadsOf = (messageId: string) =>
    readMessageFn.mock.calls.filter(([id]) => id === messageId).length;
  const offScreenReadsOf = (messageId: string) =>
    api.getWebhookMessage.mock.calls.filter(([, id]) => id === messageId)
      .length;
  const readsOf = (messageId: string) => providerReads[messageId] ?? 0;

  return {
    ...view,
    cacheReadsOf,
    invalidate,
    offScreenReadsOf,
    queryClient,
    readList,
    readMessageFn,
    readsOf,
    wrapper: Wrapper,
  };
}

/** The filters of the invalidations made since `from`. */
function invalidatedSince(
  invalidate: ReturnType<typeof renderWatch>['invalidate'],
  from: number,
) {
  return invalidate.mock.calls.slice(from).map(([filters]) => filters);
}

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.getWebhookMessage.mockReset();
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
    const { readList, readMessageFn, result } = renderWatch({
      messages: { msg_1: (read) => messageWith(read >= 3 ? 'success' : undefined) },
    });
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
    const { readMessageFn, result } = renderWatch({
      messages: { msg_1: () => messageWith('sending') },
    });
    await waitFor(() => expect(readMessageFn).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(5 * WATCH_INTERVAL_MS);

    expect(readMessageFn).toHaveBeenCalledTimes(6);
  });

  it('does not take a known attempt for the new one', async () => {
    const { readMessageFn, result } = renderWatch({
      messages: { msg_1: () => messageWith('success') },
    });
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
    const { readMessageFn, result } = renderWatch({
      messages: {
        msg_1: (read) =>
          messageWith(read >= 4 ? 'success' : undefined, { withOlder: true }),
      },
    });
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
    const { readMessageFn, result } = renderWatch({
      messages: { msg_1: () => messageWith('fail', { trigger: 'scheduled' }) },
    });
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

  it('follows a message resent while another is watched, each until its own attempt', async () => {
    const { cacheReadsOf, invalidate, readList, result } = renderWatch({
      messages: {
        // Its attempt shows on the fourth read, the tick at 9 s.
        msg_1: (read) => messageWith(read >= 4 ? 'success' : undefined),
        // Its attempt shows on the second read, the tick at 3 s.
        msg_2: (read) => ({
          ...messageWith(read >= 2 ? 'success' : undefined),
          messageId: 'msg_2',
        }),
      },
    });
    await waitFor(() => expect(cacheReadsOf('msg_2')).toBe(1));
    await waitFor(() => expect(cacheReadsOf('msg_1')).toBe(1));

    act(() => result.current.arm(target));
    await advance(2_000);
    act(() => result.current.arm(second));
    const before = invalidate.mock.calls.length;
    await advance(1_000);

    // One timer for both: the lists and the history once, each message.
    expect(invalidatedSince(invalidate, before).slice(0, 4)).toEqual([
      { queryKey: ['webhooks', 'history'], exact: true },
      { queryKey: ['webhooks', 'messages-list', 'ep_orders'] },
      { queryKey: ['webhooks', 'messages', 'ep_orders', 'msg_1'], exact: true },
      { queryKey: ['webhooks', 'messages', 'ep_orders', 'msg_2'], exact: true },
    ]);
    expect(cacheReadsOf('msg_1')).toBe(2);
    expect(cacheReadsOf('msg_2')).toBe(2);
    // msg_2's attempt settled: its lists are read once more.
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(3));

    await advance(2 * WATCH_INTERVAL_MS);
    expect(cacheReadsOf('msg_2')).toBe(2);
    expect(cacheReadsOf('msg_1')).toBe(4);
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(6));

    await advance(30_000);
    expect(cacheReadsOf('msg_1')).toBe(4);
    expect(readList).toHaveBeenCalledTimes(6);
  });

  it("ends each message's watch at its own cap", async () => {
    const { cacheReadsOf, result } = renderWatch({
      messages: {
        msg_1: () => messageWith(),
        msg_2: () => ({ ...messageWith(), messageId: 'msg_2' }),
      },
    });
    await waitFor(() => expect(cacheReadsOf('msg_2')).toBe(1));

    act(() => result.current.arm(target));
    await advance(30_000);
    act(() => result.current.arm(second));
    await advance(WATCH_CAP_MS - 30_000 - 1_000);
    // The first message is still read after the second was armed.
    const firstReads = cacheReadsOf('msg_1');
    expect(firstReads).toBeGreaterThanOrEqual(19);

    await advance(4_000);
    const firstAtCap = cacheReadsOf('msg_1');
    const secondAtFirstCap = cacheReadsOf('msg_2');
    await advance(24_000);
    expect(cacheReadsOf('msg_1')).toBe(firstAtCap);
    expect(cacheReadsOf('msg_2')).toBe(secondAtFirstCap + 8);

    await advance(10_000);
    const secondAtCap = cacheReadsOf('msg_2');
    await advance(30_000);
    expect(cacheReadsOf('msg_2')).toBe(secondAtCap);
  });

  it('waits for one attempt per resend when the same message is resent again, counting each once', async () => {
    let provider = 0;
    const { readList, readsOf, result } = renderWatch({
      listWithAttempts: true,
      messages: {
        msg_1: (read) => {
          provider = read;
          // The first resend's attempt from the tick at 3 s, the second's
          // from the tick at 12 s.
          return messageWith(read >= 2 ? 'success' : undefined, {
            also: read >= 5 ? [secondResentAttempt] : [],
          });
        },
      },
      // The dialog's list shows the first resend's attempt too: the same id
      // seen in two places is one attempt.
      readListAt: () =>
        listWith(provider >= 2 ? resentAttempt('success') : undefined),
    });
    await waitFor(() => expect(readsOf('msg_1')).toBe(1));

    act(() => result.current.arm(target));
    await advance(1_000);
    // Pressed again before the first resend's attempt was seen.
    act(() => result.current.arm(target));
    await advance(3 * WATCH_INTERVAL_MS - 1_000);
    expect(readsOf('msg_1')).toBe(4);

    await advance(WATCH_INTERVAL_MS);
    expect(readsOf('msg_1')).toBe(5);
    // The first read, one per tick, then one more after the end.
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(6));
    await advance(30_000);
    expect(readsOf('msg_1')).toBe(5);
    expect(readList).toHaveBeenCalledTimes(6);
  });

  it("starts the message's cap again when it is resent again", async () => {
    // Resent at 0 s and again at 51 s, before the first attempt shows: the
    // first attempt shows at the tick at 54 s, the second at the tick at 66 s,
    // past the cap of the first resend.
    const { readsOf, result } = renderWatch({
      messages: {
        msg_1: (read) =>
          messageWith(read >= 19 ? 'success' : undefined, {
            also: read >= 23 ? [secondResentAttempt] : [],
          }),
      },
    });
    await waitFor(() => expect(readsOf('msg_1')).toBe(1));

    act(() => result.current.arm(target));
    await advance(51_000);
    expect(readsOf('msg_1')).toBe(18);
    act(() => result.current.arm(target));
    await advance(WATCH_CAP_MS);

    // Read on each tick to the one at 66 s, which shows both attempts.
    expect(readsOf('msg_1')).toBe(23);
    await advance(30_000);
    expect(readsOf('msg_1')).toBe(23);
  });

  it('reads a message no query shows outside the cache, and ends a tick after its attempt settles', async () => {
    const { cacheReadsOf, offScreenReadsOf, queryClient, readList, rerender, result } =
      renderWatch({
        messages: {
          // Its attempt settles on the fourth read the provider sees.
          msg_1: (read) => messageWith(read >= 4 ? 'success' : undefined),
        },
      });
    await waitFor(() => expect(cacheReadsOf('msg_1')).toBe(1));

    act(() => result.current.arm(target));
    await advance(WATCH_INTERVAL_MS);
    // On screen: read through its query, never outside the cache.
    expect(cacheReadsOf('msg_1')).toBe(2);
    expect(offScreenReadsOf('msg_1')).toBe(0);

    rerender({ open: false });
    await advance(WATCH_INTERVAL_MS);
    expect(offScreenReadsOf('msg_1')).toBe(1);
    await advance(WATCH_INTERVAL_MS);
    expect(offScreenReadsOf('msg_1')).toBe(2);
    // The first read, the tick at 3 s, the close, the ticks at 6 and 9 s,
    // then one more after the end.
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(6));

    await advance(60_000);
    expect(offScreenReadsOf('msg_1')).toBe(2);
    expect(cacheReadsOf('msg_1')).toBe(2);
    expect(readList).toHaveBeenCalledTimes(6);
    // The cache keeps what its own query read, marked stale; the read
    // outside it added nothing to it.
    const cached = queryClient.getQueryState(
      webhookMessageQueryOptions('ep_orders', 'msg_1').queryKey,
    );
    expect(cached?.data?.attempts.map(({ id }) => id)).toEqual(['atmpt_1']);
    expect(cached?.isInvalidated).toBe(true);
  });

  it('reads outside the cache only the messages no list read with attempts holds', async () => {
    const { offScreenReadsOf, rerender, result } = renderWatch({
      listWithAttempts: true,
      messages: {
        msg_1: () => messageWith(),
        msg_2: () => ({ ...messageWith(), messageId: 'msg_2' }),
      },
      // The dialog's list holds msg_1, with its last attempt, not msg_2.
      readListAt: () => listWith(knownFailedAttempt),
    });

    act(() => result.current.arm(target));
    act(() => result.current.arm(second));
    rerender({ open: false });
    await advance(3 * WATCH_INTERVAL_MS);

    expect(offScreenReadsOf('msg_1')).toBe(0);
    expect(offScreenReadsOf('msg_2')).toBe(3);
  });

  it('keeps reading a message off screen after a failed read', async () => {
    const { offScreenReadsOf, rerender, result } = renderWatch({
      messages: { msg_1: (read) => messageWith(read >= 4 ? 'success' : undefined) },
    });
    await waitFor(() => expect(offScreenReadsOf('msg_1')).toBe(0));

    act(() => result.current.arm(target));
    rerender({ open: false });
    api.getWebhookMessage.mockRejectedValueOnce(new Error('503'));
    await advance(WATCH_INTERVAL_MS);
    expect(offScreenReadsOf('msg_1')).toBe(1);
    await advance(3 * WATCH_INTERVAL_MS);

    // Read again after the failure, until the attempt shows, then no more.
    expect(offScreenReadsOf('msg_1')).toBe(4);
    await advance(30_000);
    expect(offScreenReadsOf('msg_1')).toBe(4);
  });

  it('reads outside the cache a message a list read with attempts holds without its last attempt', async () => {
    // saas-api leaves the last attempt out of a message its attempts window
    // does not cover: such a list cannot show the resend's attempt.
    const { offScreenReadsOf, readList, rerender, result } = renderWatch({
      listWithAttempts: true,
      messages: { msg_1: (read) => messageWith(read >= 2 ? 'success' : undefined) },
      readListAt: () => listWith(),
    });
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    rerender({ open: false });
    await advance(WATCH_INTERVAL_MS);
    expect(offScreenReadsOf('msg_1')).toBe(1);

    // The first read, the close, the tick at 3 s and the one after the end.
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(4));
    await advance(30_000);
    expect(offScreenReadsOf('msg_1')).toBe(1);
    expect(readList).toHaveBeenCalledTimes(4);
  });

  it('reads outside the cache a message resent twice that only a list shows, a list carrying one attempt', async () => {
    // Both resends' attempts are recorded before the first tick; the dialog's
    // list shows only the newest of them.
    const { offScreenReadsOf, readList, rerender, result } = renderWatch({
      listWithAttempts: true,
      messages: {
        msg_1: (read) =>
          messageWith(read >= 2 ? 'success' : undefined, {
            also: read >= 2 ? [secondResentAttempt] : [],
          }),
      },
      readListAt: (read) =>
        listWith(read >= 2 ? secondResentAttempt : knownFailedAttempt),
    });
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    act(() => result.current.arm(target));
    // Another delivery selected: the message's own query is no longer shown.
    rerender({ open: false });
    await advance(WATCH_INTERVAL_MS);

    expect(offScreenReadsOf('msg_1')).toBe(1);
    // The first read, the close, the tick at 3 s and the one after the end.
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(4));
    await advance(30_000);
    expect(offScreenReadsOf('msg_1')).toBe(1);
    expect(readList).toHaveBeenCalledTimes(4);
  });

  it.each([404, 403])(
    'stops following a message whose read outside the cache is refused with a %i',
    async (status) => {
      const { offScreenReadsOf, readList, rerender, result } = renderWatch();
      await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

      act(() => result.current.arm(target));
      rerender({ open: false });
      // The webhook deleted, or the read no longer allowed: a later read
      // would only be refused again.
      api.getWebhookMessage.mockRejectedValue(
        new ApiError({ status, data: { status, title: 'Refused' } }),
      );
      await advance(WATCH_INTERVAL_MS);
      expect(offScreenReadsOf('msg_1')).toBe(1);
      const reads = readList.mock.calls.length;

      await advance(30_000);
      expect(offScreenReadsOf('msg_1')).toBe(1);
      expect(readList).toHaveBeenCalledTimes(reads);
    },
  );

  it('keeps reading a message outside the cache while it is not delivered yet', async () => {
    const { offScreenReadsOf, rerender, result } = renderWatch();

    act(() => result.current.arm(target));
    rerender({ open: false });
    api.getWebhookMessage.mockRejectedValue(
      new ApiError({
        status: 404,
        data: { status: 404, title: 'Not delivered', code: 'GetWebhookMessage.NotDelivered' },
      }),
    );
    await advance(3 * WATCH_INTERVAL_MS);

    expect(offScreenReadsOf('msg_1')).toBe(3);
  });

  it('counts from the older known attempt when the same message is resent again', async () => {
    const { queryClient, readsOf, result } = renderWatch({
      messages: {
        msg_1: (read) =>
          messageWith(read >= 2 ? 'success' : undefined, {
            also: read >= 4 ? [secondResentAttempt] : [],
          }),
      },
    });
    await waitFor(() => expect(readsOf('msg_1')).toBe(1));

    act(() => result.current.arm(target));
    // The detail reads the first resend's attempt before the first tick, and
    // Resend, enabled again, is pressed with that attempt as the newest known.
    await act(() =>
      queryClient.refetchQueries({
        queryKey: webhookMessageQueryOptions('ep_orders', 'msg_1').queryKey,
      }),
    );
    expect(readsOf('msg_1')).toBe(2);
    act(() =>
      result.current.arm({
        ...target,
        latestKnownAttempt: { id: 'atmpt_2', timestamp: '2026-11-26T10:00:00Z' },
      }),
    );

    // The tick at 3 s shows the first resend's attempt only, the one at 6 s
    // the second's too: the watch ends there.
    await advance(2 * WATCH_INTERVAL_MS);
    expect(readsOf('msg_1')).toBe(4);
    await advance(30_000);
    expect(readsOf('msg_1')).toBe(4);
  });

  it('counts from the newest attempt the cache holds when armed, not only the one the detail knew', async () => {
    // On the History tab, an older attempt is clicked and resent before the
    // message is read: the History also holds a later manual attempt, an
    // earlier resend's, which the message's read then shows.
    const earlierResend = resentAttempt('fail');
    const { queryClient, readsOf, result } = renderWatch({
      messages: {
        msg_1: (read) =>
          messageWith(read >= 2 ? 'fail' : undefined, {
            also: read >= 3 ? [secondResentAttempt] : [],
          }),
      },
    });
    await waitFor(() => expect(readsOf('msg_1')).toBe(1));
    const entry = (attempt: WebhookMessageAttempt) => ({
      date: attempt.timestamp,
      hookId: 'ep_orders',
      hookUrl: 'https://api.example.com/hooks',
      eventType: 'com.kaiten.instance.v1.created',
      status: attempt.status,
      messageId: 'msg_1',
      attemptId: attempt.id,
      triggerType: attempt.triggerType,
    });
    queryClient.setQueryData(webhookHistoryQueryOptions.queryKey, {
      history: [entry(earlierResend), entry(knownFailedAttempt)],
    });

    act(() => result.current.arm(target));
    await advance(WATCH_INTERVAL_MS);
    // The earlier resend's attempt does not end it.
    expect(readsOf('msg_1')).toBe(2);
    await advance(WATCH_INTERVAL_MS);
    expect(readsOf('msg_1')).toBe(3);
    await advance(30_000);
    expect(readsOf('msg_1')).toBe(3);
  });

  it('follows a message resent again from a dialog opened again as one message, read once per tick', async () => {
    // The first resend's attempt shows on the second read, the second's on
    // the fourth.
    const { offScreenReadsOf, readsOf, result, unmount, wrapper } = renderWatch({
      messages: {
        msg_1: (read) =>
          messageWith(read >= 2 ? 'success' : undefined, {
            also: read >= 4 ? [secondResentAttempt] : [],
          }),
      },
    });
    await waitFor(() => expect(readsOf('msg_1')).toBe(1));

    act(() => result.current.arm(target));
    await advance(1_000);
    // The dialog closes, its body unmounts, and a new body opens on the
    // message, which still reads failed.
    unmount();
    const reopened = renderHook(() => useDeliveryWatch(), { wrapper });
    act(() => reopened.result.current.arm(target));

    await advance(2_000);
    expect(offScreenReadsOf('msg_1')).toBe(1);
    await advance(2 * WATCH_INTERVAL_MS);
    expect(offScreenReadsOf('msg_1')).toBe(3);
    await advance(30_000);
    expect(offScreenReadsOf('msg_1')).toBe(3);
    reopened.unmount();
  });

  it('reads the lists and the history once more when closed after a settled resend', async () => {
    const { invalidate, readList, readMessageFn, rerender, result } =
      renderWatch({
        messages: { msg_1: (read) => messageWith(read >= 2 ? 'success' : undefined) },
      });
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(WATCH_INTERVAL_MS);
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(3));
    const before = invalidate.mock.calls.length;
    rerender({ open: false });

    expect(invalidatedSince(invalidate, before)).toEqual([
      { queryKey: ['webhooks', 'messages-list', 'ep_orders'] },
      { queryKey: ['webhooks', 'history'], exact: true },
    ]);
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(4));
    await advance(30_000);
    expect(readList).toHaveBeenCalledTimes(4);
    expect(readMessageFn).toHaveBeenCalledTimes(2);
    expect(api.getWebhookMessage).not.toHaveBeenCalled();
  });

  it('after a close, reads the lists and the message outside the cache on each tick until its cap', async () => {
    const { cacheReadsOf, offScreenReadsOf, readList, rerender, result } =
      renderWatch();
    await waitFor(() => expect(readList).toHaveBeenCalledTimes(1));

    act(() => result.current.arm(target));
    await advance(1_000);
    rerender({ open: false });
    await advance(WATCH_CAP_MS);

    // The read at the close, then one per tick until the cap.
    const ticks = Math.floor((WATCH_CAP_MS + 1_000) / WATCH_INTERVAL_MS);
    expect(readList).toHaveBeenCalledTimes(2 + ticks);
    expect(offScreenReadsOf('msg_1')).toBe(ticks);
    expect(cacheReadsOf('msg_1')).toBe(1);
    const reads = readList.mock.calls.length;
    await advance(60_000);
    expect(readList).toHaveBeenCalledTimes(reads);
    expect(offScreenReadsOf('msg_1')).toBe(ticks);
  });

  it('reads the message again when it is shown again after a close', async () => {
    const { cacheReadsOf, offScreenReadsOf, readList, rerender, result } =
      renderWatch({
        messages: { msg_1: (read) => messageWith(read >= 3 ? 'success' : undefined) },
      });
    await waitFor(() => expect(cacheReadsOf('msg_1')).toBe(1));

    act(() => result.current.arm(target));
    await advance(1_000);
    rerender({ open: false });
    await advance(WATCH_INTERVAL_MS);
    expect(cacheReadsOf('msg_1')).toBe(1);
    expect(offScreenReadsOf('msg_1')).toBe(1);

    // Marked stale by the tick while off screen, it is read when shown, and
    // through its query on the next tick, which ends the watch.
    rerender({ open: true });
    await waitFor(() => expect(cacheReadsOf('msg_1')).toBe(2));
    await advance(WATCH_INTERVAL_MS);
    expect(cacheReadsOf('msg_1')).toBe(3);
    expect(offScreenReadsOf('msg_1')).toBe(1);
    const reads = readList.mock.calls.length;
    await advance(30_000);
    expect(cacheReadsOf('msg_1')).toBe(3);
    expect(readList).toHaveBeenCalledTimes(reads);
  });

  it('ends after a close once a list read with attempts shows the new attempt, settled', async () => {
    const { offScreenReadsOf, readList, rerender, result } = renderWatch({
      listWithAttempts: true,
      readListAt: (read) =>
        listWith(read >= 4 ? resentAttempt('success') : knownFailedAttempt),
    });
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
    // The list on screen shows the message's attempts.
    expect(offScreenReadsOf('msg_1')).toBe(0);
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

  it('after the owner unmounts, reads the message outside the cache only, even with a tick in flight', async () => {
    let answerList: (list: WebhookMessageList) => void = () => undefined;
    const { cacheReadsOf, invalidate, offScreenReadsOf, readList, result, unmount } =
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
    // stale: nothing shows them any more, so nothing is fetched through them.
    expect(invalidatedSince(invalidate, before)).toEqual([
      { queryKey: ['webhooks', 'messages-list', 'ep_orders'] },
      { queryKey: ['webhooks', 'history'], exact: true },
      { queryKey: ['webhooks', 'history'], exact: true },
      { queryKey: ['webhooks', 'messages-list', 'ep_orders'] },
      { queryKey: ['webhooks', 'messages', 'ep_orders', 'msg_1'], exact: true },
    ]);
    expect(readList).toHaveBeenCalledTimes(2);
    // The one read with the first tick, before the unmount, then the
    // message is read outside the cache.
    expect(cacheReadsOf('msg_1')).toBe(2);
    expect(offScreenReadsOf('msg_1')).toBe(1);
  });
});

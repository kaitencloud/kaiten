/**
 * The resend watch shared under one query client: the messages it follows, its
 * one timer and what each tick reads. `useDeliveryWatch` gives each dialog an
 * owner of it.
 */
import type { QueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import {
  invalidateWatchedDeliveryQueries,
  isMessagesListReadWithAttempts,
  type WebhookMessageRef,
  webhookHistoryQueryOptions,
  webhookMessagesListBaseQueryKey,
} from '../queries';
import type { WebhookMessageAttempt } from '../types';
import {
  countNewSettledAttempts,
  getCachedAttempts,
  getEarlierKnownAttempt,
  getNewestKnownAttempt,
  isShownWithAttempts,
  type KnownAttempt,
  REFUSED,
  readAttemptsOffScreen,
  type WatchedAttempt,
} from './delivery-watch-attempts';

/** How often the deliveries are read again while a resend is watched. */
export const WATCH_INTERVAL_MS = 3_000;

/**
 * How long a resent message is watched at most, from its last resend. A resend
 * most often targets an endpoint that was failing, which is where a slow answer
 * or a timeout is the most likely: the attempt can take well over the few
 * seconds a healthy endpoint needs before the delivery provider records it.
 */
export const WATCH_CAP_MS = 60_000;

/**
 * How long a tick waits for its reads at most. A read outside the cache still
 * unanswered then is aborted and shows no attempt, and a refetch still in
 * flight is no longer waited for, so that one stalled request holds neither
 * the other messages nor the caps.
 */
export const WATCH_READ_TIMEOUT_MS = 10_000;

export interface DeliveryWatchTarget extends WebhookMessageRef {
  /**
   * The newest attempt the detail knew when Resend was pressed, if any. Once
   * the message is read the detail knows every attempt; before that, or when
   * the read failed, it knows only the list's last attempt or the History's
   * clicked one. Comparing by order, not by id, keeps an older attempt the
   * detail never knew from being taken for the resend's. A History attempt
   * that is not the message's newest, resent before the message is read or
   * after its read failed, is followed by attempts the detail never knew;
   * since a resend's attempt is manual, a scheduled one among them does not
   * end the watch. The watch counts from the newest of this attempt, every
   * attempt of the message the cache holds when it is armed (the History's,
   * say) and the newest it saw of the message while it watched it before; a
   * message still watched, or whose watch reached its cap, keeps counting from
   * the attempt that watch counted from, when older.
   */
  latestKnownAttempt?: Pick<WebhookMessageAttempt, 'id' | 'timestamp'>;
}

export interface DeliveryWatch {
  /**
   * Starts watching a resent message, beside the other messages watched. A
   * message already watched, from this dialog or another, or whose last watch
   * reached its cap, then waits for one more attempt, and its cap starts
   * again.
   */
  arm: (target: DeliveryWatchTarget) => void;
}

interface WatchedMessage extends WebhookMessageRef {
  /** Only a settled attempt not scheduled, later than this one, can be a resend's. */
  latestKnownAttempt?: KnownAttempt;
  /** The resends since the watch of this message began: as many new attempts end it. */
  resends: number;
  deadline: number;
}

function keyOf({ webhookId, messageId }: WebhookMessageRef) {
  return `${webhookId}:${messageId}`;
}

/**
 * Reads webhooks' message lists (the row's strip among them) and the history
 * again. With `withAttempts: 'mark-stale'`, the lists read with attempts, which
 * only a deliveries dialog reads, are marked stale without being read: the
 * dialog closing is the one that shows them.
 */
export async function refreshDeliveryLists(
  queryClient: QueryClient,
  webhookIds: string[],
  { withAttempts = 'read' }: { withAttempts?: 'read' | 'mark-stale' } = {},
) {
  if (webhookIds.length === 0) {
    return;
  }
  await Promise.all([
    ...webhookIds.flatMap((webhookId) => {
      const queryKey = [...webhookMessagesListBaseQueryKey, webhookId];
      if (withAttempts === 'read') {
        return [queryClient.invalidateQueries({ queryKey })];
      }
      return [
        queryClient.invalidateQueries({
          queryKey,
          predicate: (query) => !isMessagesListReadWithAttempts(query.queryKey),
        }),
        queryClient.invalidateQueries({
          queryKey,
          predicate: (query) => isMessagesListReadWithAttempts(query.queryKey),
          refetchType: 'none',
        }),
      ];
    }),
    queryClient.invalidateQueries({
      queryKey: webhookHistoryQueryOptions.queryKey,
      exact: true,
    }),
  ]);
}

/**
 * Whether anything still renders from the query client. Once no query of it
 * has an observer, its app was unmounted (a switch of organization mounts the
 * app again on a new client) and a watch has nothing left to update.
 */
function isQueryClientInUse(queryClient: QueryClient) {
  return queryClient
    .getQueryCache()
    .getAll()
    .some((query) => query.getObserversCount() > 0);
}

/** What `promise` answers, or `fallback` once `signal` aborts first. */
function settleBy<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  fallback: T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    signal.addEventListener('abort', () => resolve(fallback), { once: true });
    promise.then(resolve, reject);
  });
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function createDeliveryWatch(queryClient: QueryClient) {
  const watched = new Map<string, WatchedMessage>();
  // Watches that reached their cap before their attempts showed. A later
  // resend of the message takes its watch up again: an earlier resend's
  // attempt recorded after the cap is one it waits for, not the new resend's.
  const lapsed = new Map<string, WatchedMessage>();
  // The newest attempt seen of each message watched so far, its id and time
  // only: a resend made after its watch ended never counts one of them.
  const newestSeen = new Map<string, KnownAttempt>();
  // Set while a tick is scheduled or running: one timer chain serves every
  // watched message.
  let ticking = false;

  function schedule() {
    ticking = true;
    setTimeout(() => {
      void tick();
    }, WATCH_INTERVAL_MS);
  }

  /** Reads every watched message once, and ends the watches of those settled or refused. */
  async function readWatchedMessages() {
    const messages = [...watched.values()];
    // A message whose attempts no query on screen shows is read outside the
    // cache; any other is read through its queries, refetched below.
    const offScreen = messages.filter(
      (message) => !isShownWithAttempts(queryClient, message, message.resends),
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WATCH_READ_TIMEOUT_MS);
    let offScreenAttempts: (WatchedAttempt[] | typeof REFUSED)[];
    try {
      [, offScreenAttempts] = await Promise.all([
        // Only the queries on screen are read again. A message no dialog
        // shows is only marked stale, which keeps its payload no longer in
        // memory than its gcTime allows.
        settleBy(
          invalidateWatchedDeliveryQueries(queryClient, messages),
          controller.signal,
          undefined,
        ),
        Promise.all(
          offScreen.map((message) =>
            settleBy(
              readAttemptsOffScreen(message, controller.signal),
              controller.signal,
              [],
            ),
          ),
        ),
      ]);
    } finally {
      clearTimeout(timer);
    }
    const readAttempts = new Map<
      WatchedMessage,
      WatchedAttempt[] | typeof REFUSED
    >(offScreen.map((message, index) => [message, offScreenAttempts[index]]));
    const settledWebhookIds = new Set<string>();
    for (const message of messages) {
      const key = keyOf(message);
      const read = readAttempts.get(message) ?? [];
      if (read === REFUSED) {
        watched.delete(key);
        continue;
      }
      const attempts = [...getCachedAttempts(queryClient, message), ...read];
      const newest = getNewestKnownAttempt([newestSeen.get(key), ...attempts]);
      if (newest) {
        newestSeen.set(key, newest);
      }
      // `resends` is read now, not when the tick began: a resend of the same
      // message while the reads were in flight counts.
      if (
        countNewSettledAttempts(attempts, message.latestKnownAttempt) >=
        message.resends
      ) {
        watched.delete(key);
        settledWebhookIds.add(message.webhookId);
      }
    }
    // The lists were read alongside the message, and may have been answered
    // just before the provider recorded the attempt: one more read leaves
    // them agreeing with the detail.
    void refreshDeliveryLists(queryClient, [...settledWebhookIds]);
  }

  /** Ends the watches past their cap, keeping them to be taken up again. */
  function lapseExpiredWatches(now: number) {
    for (const [key, message] of watched) {
      if (now >= message.deadline) {
        watched.delete(key);
        lapsed.set(key, message);
      }
    }
  }

  async function tick() {
    try {
      if (!isQueryClientInUse(queryClient)) {
        watched.clear();
        return;
      }
      await readWatchedMessages();
    } catch (error) {
      // A tick that fails still ends the watches past their cap and schedules
      // the next one, so that one failure never stops the watch.
      logger.error(toError(error), { source: 'useDeliveryWatch' });
    } finally {
      lapseExpiredWatches(Date.now());
      ticking = false;
      if (watched.size > 0) {
        schedule();
      }
    }
  }

  return {
    arm(target: DeliveryWatchTarget) {
      const key = keyOf(target);
      const deadline = Date.now() + WATCH_CAP_MS;
      // Every attempt the cache holds, or the watch saw, came before this
      // resend: the newest of them and the detail's is counted from.
      const latestKnownAttempt = getNewestKnownAttempt([
        target.latestKnownAttempt,
        newestSeen.get(key),
        ...getCachedAttempts(queryClient, target),
      ]);
      let current = watched.get(key);
      if (!current) {
        current = lapsed.get(key);
        if (current) {
          lapsed.delete(key);
          watched.set(key, current);
        }
      }
      if (current) {
        // Pressed again before an earlier resend's attempt was seen: counted
        // from the older known attempt, each resend waits for one attempt of
        // its own. Updated in place, so that a tick in flight sees it.
        current.resends += 1;
        current.deadline = deadline;
        current.latestKnownAttempt = getEarlierKnownAttempt(
          current.latestKnownAttempt,
          latestKnownAttempt,
        );
      } else {
        watched.set(key, {
          webhookId: target.webhookId,
          messageId: target.messageId,
          latestKnownAttempt,
          resends: 1,
          deadline,
        });
      }
      if (!ticking) {
        schedule();
      }
    },
  };
}

type SharedDeliveryWatch = ReturnType<typeof createDeliveryWatch>;

// One watch per query client, shared by every dialog that resends: a message
// resent again from a dialog opened again, or from the History's dialog, is
// the same message watched, read once per tick.
const watches = new WeakMap<QueryClient, SharedDeliveryWatch>();

/** The watch shared by every owner under `queryClient`, made on first use. */
export function getSharedDeliveryWatch(queryClient: QueryClient) {
  let watch = watches.get(queryClient);
  if (!watch) {
    watch = createDeliveryWatch(queryClient);
    watches.set(queryClient, watch);
  }

  return watch;
}

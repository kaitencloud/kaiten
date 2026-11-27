import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  invalidateWatchedDeliveryQueries,
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
   * say) and the newest it saw of the message while it watched it before.
   */
  latestKnownAttempt?: Pick<WebhookMessageAttempt, 'id' | 'timestamp'>;
}

export interface DeliveryWatch {
  /**
   * Starts watching a resent message, beside the other messages watched. A
   * message already watched, from this dialog or another, then waits for one
   * more attempt, and its cap starts again.
   */
  arm: (target: DeliveryWatchTarget) => void;
}

interface WatchedMessage extends WebhookMessageRef {
  /** Only a settled manual attempt later than this one can be a resend's. */
  latestKnownAttempt?: KnownAttempt;
  /** The resends since the watch of this message began: as many new attempts end it. */
  resends: number;
  deadline: number;
}

function keyOf({ webhookId, messageId }: WebhookMessageRef) {
  return `${webhookId}:${messageId}`;
}

/** Reads webhooks' message lists (the row's strip among them) and the history again. */
async function refreshDeliveryLists(
  queryClient: QueryClient,
  webhookIds: string[],
) {
  if (webhookIds.length === 0) {
    return;
  }
  await Promise.all([
    ...webhookIds.map((webhookId) =>
      queryClient.invalidateQueries({
        queryKey: [...webhookMessagesListBaseQueryKey, webhookId],
      }),
    ),
    queryClient.invalidateQueries({
      queryKey: webhookHistoryQueryOptions.queryKey,
      exact: true,
    }),
  ]);
}

function createDeliveryWatch(queryClient: QueryClient) {
  const watched = new Map<string, WatchedMessage>();
  // The newest attempt seen of each message watched so far, its id and time
  // only: a resend made after its watch ended never counts one of them.
  const newestSeen = new Map<string, KnownAttempt>();
  // Set while a tick is scheduled or its reads are in flight: one timer chain
  // serves every watched message.
  let ticking = false;

  function schedule() {
    ticking = true;
    setTimeout(() => {
      void tick();
    }, WATCH_INTERVAL_MS);
  }

  async function tick() {
    const messages = [...watched.values()];
    // A message whose attempts no query on screen shows is read outside the
    // cache; any other is read through its queries, refetched below.
    const offScreen = messages.filter(
      (message) => !isShownWithAttempts(queryClient, message, message.resends),
    );
    const [, offScreenAttempts] = await Promise.all([
      // Only the queries on screen are read again. A message no dialog shows
      // is only marked stale, which keeps its payload no longer in memory than
      // its gcTime allows, and a dialog opened on it again reads it at once.
      invalidateWatchedDeliveryQueries(queryClient, messages),
      Promise.all(offScreen.map(readAttemptsOffScreen)),
    ]);
    const readAttempts = new Map<
      WatchedMessage,
      WatchedAttempt[] | typeof REFUSED
    >(offScreen.map((message, index) => [message, offScreenAttempts[index]]));
    const now = Date.now();
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
      // `resends` and `deadline` are read now, not when the tick began: a
      // resend of the same message while the reads were in flight counts.
      if (
        countNewSettledAttempts(attempts, message.latestKnownAttempt) >=
        message.resends
      ) {
        watched.delete(key);
        settledWebhookIds.add(message.webhookId);
      } else if (now >= message.deadline) {
        watched.delete(key);
      }
    }
    // The lists were read alongside the message, and may have been answered
    // just before the provider recorded the attempt: one more read leaves
    // them agreeing with the detail.
    void refreshDeliveryLists(queryClient, [...settledWebhookIds]);
    ticking = false;
    if (watched.size > 0) {
      schedule();
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
      const current = watched.get(key);
      if (current) {
        // Pressed again before the first resend's attempt was seen: counted
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

function getSharedDeliveryWatch(queryClient: QueryClient) {
  let watch = watches.get(queryClient);
  if (!watch) {
    watch = createDeliveryWatch(queryClient);
    watches.set(queryClient, watch);
  }

  return watch;
}

function createDeliveryWatchOwner(queryClient: QueryClient) {
  const watch = getSharedDeliveryWatch(queryClient);
  // The webhooks resent to since the owner opened, whose lists and history
  // are read once more when it closes.
  const resentWebhookIds = new Set<string>();

  return {
    arm(target: DeliveryWatchTarget) {
      resentWebhookIds.add(target.webhookId);
      watch.arm(target);
    },
    /**
     * When the owner closes. After a resend, the webhooks' message lists (the
     * row's strip among them) and the history are read at once, so that what
     * stays on screen catches up with what the dialog showed. A message still
     * waiting for its attempt goes on being watched until its end: on a slow
     * endpoint the attempt often settles after the dialog is closed, and the
     * row's strip would otherwise stay on the failure, since nothing else
     * reads it again.
     */
    close() {
      void refreshDeliveryLists(queryClient, [...resentWebhookIds]);
      resentWebhookIds.clear();
    },
  };
}

/**
 * A watch over the attempts resends queue. Every dialog under one query client
 * shares it: a message resent from several dialogs, or from one opened again,
 * is followed once. It follows every message resent, each until its own end.
 * Once armed, every 3 s, each tick's reads settled before the next starts, it
 * invalidates the history once, the message lists of each watched message's
 * webhook once (the dialog's list and the row's strip behind it), and each
 * watched message: those on screen are read again, the others only marked
 * stale. A message whose attempts no query on screen shows is read outside the
 * cache, once per tick, keeping only its attempts' id, time, status and
 * trigger, so its watch can end while only the row's strip, which carries no
 * attempts, is on screen. Such a message is one whose own query is not on
 * screen (its dialog closed, or another delivery selected) and which no list
 * read with attempts shows with its last attempt; a message resent more than
 * once needs its own query, since a list shows its last attempt only.
 *
 * A message's watch ends once the message, a list read with attempts or the
 * History shows settled manual attempts newer than the newest known when it
 * was resent, one per resend of it (its webhook's lists are then read once
 * more); when its read outside the cache is refused with a 403, or a 404 other
 * than a message not delivered yet; or `WATCH_CAP_MS` after its last resend.
 *
 * When `open` turns false or the owner unmounts, it reads the lists of the
 * webhooks this owner resent to and the history once more, and the messages
 * still waiting go on being watched until their end. Nothing renders from it.
 */
export function useDeliveryWatch({
  open = true,
}: { open?: boolean } = {}): DeliveryWatch {
  const queryClient = useQueryClient();
  const [owner] = useState(() => createDeliveryWatchOwner(queryClient));

  useEffect(() => {
    if (!open) {
      return;
    }
    return () => {
      owner.close();
    };
  }, [open, owner]);

  return owner;
}

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  invalidateWebhookDeliveryQueries,
  webhookHistoryQueryOptions,
  webhookMessageQueryOptions,
  webhookMessagesListBaseQueryKey,
} from '../queries';
import type { WebhookMessageAttempt } from '../types';
import { isLaterAttempt } from '../utils/webhook-deliveries';

/** How often the deliveries are read again while a resend is watched. */
export const WATCH_INTERVAL_MS = 3_000;

/**
 * How long a resend is watched at most. A resend most often targets an
 * endpoint that was failing, which is where a slow answer or a timeout is the
 * most likely: the attempt can take well over the few seconds a healthy
 * endpoint needs before the delivery provider records it.
 */
export const WATCH_CAP_MS = 60_000;

export interface DeliveryWatchTarget {
  webhookId: string;
  messageId: string;
  /**
   * The newest attempt the detail knew when Resend was pressed, if any. Once
   * the message is read the detail knows every attempt; before that, or when
   * the read failed, it knows only the list's last attempt or the History's
   * clicked one. Comparing by order, not by id, keeps an older attempt the
   * detail never knew from being taken for the resend's. Only a History
   * attempt that is not the message's newest, resent before the message is
   * read, can still end the watch early, on an attempt that followed it.
   */
  latestKnownAttempt?: Pick<WebhookMessageAttempt, 'id' | 'timestamp'>;
}

export interface DeliveryWatch {
  /** Starts watching a resent message, in place of any message watched. */
  arm: (target: DeliveryWatchTarget) => void;
}

interface Run {
  target: DeliveryWatchTarget;
  deadline: number;
  /** Set once the owner closed: the message is off screen, the lists are not. */
  detached: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Whether the message read holds an attempt newer than the newest one the
 * detail knew, settled. The delivery provider may record an attempt only once
 * it completes, so a new attempt is never waited for in the sending state; one
 * that is still sending or pending does not end the watch.
 */
function hasNewSettledAttempt(
  queryClient: QueryClient,
  { webhookId, messageId, latestKnownAttempt }: DeliveryWatchTarget,
): boolean {
  const message = queryClient.getQueryData(
    webhookMessageQueryOptions(webhookId, messageId).queryKey,
  );

  return (message?.attempts ?? []).some(
    (attempt) =>
      (attempt.status === 'success' || attempt.status === 'fail') &&
      (latestKnownAttempt === undefined ||
        isLaterAttempt(attempt, latestKnownAttempt)),
  );
}

/** Reads a webhook's message lists (the row's strip among them) and the history again. */
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
  let run: Run | undefined;
  // The webhooks resent to since the owner opened, whose lists and history
  // are read once more when it closes.
  const resentWebhookIds = new Set<string>();

  function schedule(current: Run) {
    current.timer = setTimeout(() => {
      void tick(current);
    }, WATCH_INTERVAL_MS);
  }

  async function tick(current: Run) {
    const { webhookId, messageId } = current.target;
    // Once detached, the message is no longer on screen and is not read
    // again, to keep its payload out of memory: only the lists are.
    await (current.detached
      ? refreshDeliveryLists(queryClient, [webhookId])
      : invalidateWebhookDeliveryQueries(queryClient, webhookId, messageId));
    if (run !== current) {
      // Replaced while the reads were in flight.
      return;
    }
    if (hasNewSettledAttempt(queryClient, current.target)) {
      run = undefined;
      // The lists were read alongside the message, and may have been
      // answered just before the provider recorded the attempt: one more
      // read leaves them agreeing with the detail.
      void refreshDeliveryLists(queryClient, [webhookId]);
      return;
    }
    if (Date.now() >= current.deadline) {
      run = undefined;
      return;
    }
    schedule(current);
  }

  return {
    arm(target: DeliveryWatchTarget) {
      if (run) {
        clearTimeout(run.timer);
      }
      resentWebhookIds.add(target.webhookId);
      run = { target, deadline: Date.now() + WATCH_CAP_MS, detached: false };
      schedule(run);
    },
    /**
     * When the owner closes. After a resend, the webhook's message lists (the
     * row's strip among them) and the history are read at once, so that what
     * stays on screen catches up with what the dialog showed. A watch still
     * waiting for its attempt goes on until its cap, reading only the lists
     * and the history: on a slow endpoint the attempt often settles after the
     * dialog is closed, and the row's strip would otherwise stay on the
     * failure, since nothing else reads it again.
     */
    close() {
      if (run) {
        run.detached = true;
      }
      void refreshDeliveryLists(queryClient, [...resentWebhookIds]);
      resentWebhookIds.clear();
    },
  };
}

/**
 * A watch over the attempt a resend queues, held by the owner of a dialog.
 * Once armed, every 3 s, each read settled before the next starts, it reads
 * again every delivery query of the webhook on screen: the dialog's list and
 * message, the row's strip behind the dialog and the History table. It ends
 * when the message shows a settled attempt newer than the newest the detail
 * knew (the lists are then read once more), or `WATCH_CAP_MS` after the
 * resend. When the person selects another delivery meanwhile, the watched
 * message is no longer on screen and is not read again: the watch then runs
 * to its cap, still keeping the lists current.
 *
 * When `open` turns false or the owner unmounts, it reads the webhook's lists
 * and the history once more after a resend, and a watch still waiting goes on
 * reading only those until its cap. Nothing renders from it.
 */
export function useDeliveryWatch({
  open = true,
}: { open?: boolean } = {}): DeliveryWatch {
  const queryClient = useQueryClient();
  const [watch] = useState(() => createDeliveryWatch(queryClient));

  useEffect(() => {
    if (!open) {
      return;
    }
    return () => {
      watch.close();
    };
  }, [open, watch]);

  return watch;
}

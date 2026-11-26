import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  invalidateWebhookDeliveryQueries,
  webhookHistoryQueryOptions,
  webhookMessageQueryOptions,
  webhookMessagesListBaseQueryKey,
} from '../queries';
import type { WebhookMessageAttempt, WebhookMessageList } from '../types';
import {
  getHistoryEntryAttemptId,
  isLaterAttempt,
} from '../utils/webhook-deliveries';

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
   * detail never knew from being taken for the resend's. A History attempt
   * that is not the message's newest, resent before the message is read or
   * after its read failed, is followed by attempts the detail never knew;
   * since a resend's attempt is manual, a scheduled one among them does not
   * end the watch.
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
  timer?: ReturnType<typeof setTimeout>;
}

type CachedAttempt = Pick<
  WebhookMessageAttempt,
  'id' | 'timestamp' | 'status' | 'triggerType'
>;

/**
 * Every attempt of the watched message the cache holds: the message's own,
 * the last attempt a list read with attempts carries, and the History's
 * entries. Once the dialog closes the message is no longer read, while the
 * History table may still be, so each source can be the first to show the
 * resend's attempt.
 */
function getCachedAttempts(
  queryClient: QueryClient,
  { webhookId, messageId }: DeliveryWatchTarget,
): CachedAttempt[] {
  const message = queryClient.getQueryData(
    webhookMessageQueryOptions(webhookId, messageId).queryKey,
  );
  const fromLists = queryClient
    .getQueriesData<WebhookMessageList>({
      queryKey: [...webhookMessagesListBaseQueryKey, webhookId],
    })
    .flatMap(([, list]) => list?.messages ?? [])
    .flatMap((summary) =>
      summary.messageId === messageId && summary.lastAttempt
        ? [summary.lastAttempt]
        : [],
    );
  const fromHistory = (
    queryClient.getQueryData(webhookHistoryQueryOptions.queryKey)?.history ?? []
  )
    .filter(
      (entry) => entry.hookId === webhookId && entry.messageId === messageId,
    )
    .map((entry) => ({
      id: getHistoryEntryAttemptId(entry),
      timestamp: entry.date,
      status: entry.status,
      triggerType: entry.triggerType,
    }));

  return [...(message?.attempts ?? []), ...fromLists, ...fromHistory];
}

/**
 * Whether the cache holds an attempt of the message newer than the newest one
 * the detail knew, settled, and not scheduled by the delivery provider. The
 * provider may record an attempt only once it completes, so a new attempt is
 * never waited for in the sending state; one that is still sending or pending
 * does not end the watch. A resend's attempt is manual: a scheduled retry that
 * follows an attempt the detail knew is never taken for it, while an attempt
 * whose trigger is not reported still counts.
 */
function hasNewSettledAttempt(
  queryClient: QueryClient,
  target: DeliveryWatchTarget,
): boolean {
  const { latestKnownAttempt } = target;

  return getCachedAttempts(queryClient, target).some(
    (attempt) =>
      (attempt.status === 'success' || attempt.status === 'fail') &&
      attempt.triggerType !== 'scheduled' &&
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
    // Only the queries on screen are read again. A message no dialog shows is
    // only marked stale, which keeps its payload no longer in memory than its
    // gcTime allows, and a dialog opened on it again reads it at once.
    await invalidateWebhookDeliveryQueries(queryClient, webhookId, messageId);
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
      run = { target, deadline: Date.now() + WATCH_CAP_MS };
      schedule(run);
    },
    /**
     * When the owner closes. After a resend, the webhook's message lists (the
     * row's strip among them) and the history are read at once, so that what
     * stays on screen catches up with what the dialog showed. A watch still
     * waiting for its attempt goes on until its cap: on a slow endpoint the
     * attempt often settles after the dialog is closed, and the row's strip
     * would otherwise stay on the failure, since nothing else reads it again.
     */
    close() {
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
 * when the message, a list read with attempts or the History shows a settled
 * attempt newer than the newest the detail knew (the lists are then read once
 * more), or `WATCH_CAP_MS` after the resend. When the person selects another
 * delivery meanwhile, the watched message is no longer on screen and is not
 * read again until it is shown again: the watch then keeps the lists current.
 *
 * When `open` turns false or the owner unmounts, it reads the webhook's lists
 * and the history once more after a resend, and a watch still waiting goes on,
 * reading what is still on screen, until its cap. A dialog opened again on
 * the message within that time reads it again. Nothing renders from it.
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

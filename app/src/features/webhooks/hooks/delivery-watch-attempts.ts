import type { QueryClient } from '@tanstack/react-query';
import {
  isMessagesListReadWithAttempts,
  type WebhookMessageRef,
  webhookHistoryQueryOptions,
  webhookMessageQueryOptions,
  webhookMessagesListBaseQueryKey,
} from '../queries';
import type { WebhookMessageAttempt, WebhookMessageList } from '../types';
import {
  getHistoryEntryAttemptId,
  isLaterAttempt,
} from '../utils/webhook-deliveries';
import { getWebhookMessage } from '../webhooks.api';

/**
 * What the resend watch keeps of an attempt to decide whether it settled:
 * never its response, nor the message's payload.
 */
export type WatchedAttempt = Pick<
  WebhookMessageAttempt,
  'id' | 'timestamp' | 'status' | 'triggerType'
>;

type KnownAttempt = Pick<WebhookMessageAttempt, 'id' | 'timestamp'>;

function toWatchedAttempt({
  id,
  timestamp,
  status,
  triggerType,
}: WatchedAttempt): WatchedAttempt {
  return { id, timestamp, status, triggerType };
}

function getMessageLists(queryClient: QueryClient, webhookId: string) {
  return queryClient.getQueriesData<WebhookMessageList>({
    queryKey: [...webhookMessagesListBaseQueryKey, webhookId],
  });
}

/**
 * Every attempt of the message the cache holds: the message's own, the last
 * attempt a list read with attempts carries, and the History's entries. Each
 * source can be the first to show a resend's attempt.
 */
export function getCachedAttempts(
  queryClient: QueryClient,
  { webhookId, messageId }: WebhookMessageRef,
): WatchedAttempt[] {
  const message = queryClient.getQueryData(
    webhookMessageQueryOptions(webhookId, messageId).queryKey,
  );
  const fromLists = getMessageLists(queryClient, webhookId)
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
 * Whether a query on screen shows the message's attempts, and so is read again
 * by the watch's invalidation: the message's own query, or a list read with
 * attempts that holds the message. The row's strip reads its list without
 * attempts, so it never counts.
 */
export function isShownWithAttempts(
  queryClient: QueryClient,
  { webhookId, messageId }: WebhookMessageRef,
): boolean {
  const message = queryClient.getQueriesData({
    queryKey: webhookMessageQueryOptions(webhookId, messageId).queryKey,
    exact: true,
    type: 'active',
  });
  if (message.length > 0) {
    return true;
  }

  return queryClient
    .getQueriesData<WebhookMessageList>({
      queryKey: [...webhookMessagesListBaseQueryKey, webhookId],
      type: 'active',
    })
    .some(
      ([queryKey, list]) =>
        isMessagesListReadWithAttempts(queryKey) &&
        (list?.messages ?? []).some(
          (summary) => summary.messageId === messageId,
        ),
    );
}

/**
 * Reads a message outside the query cache, for a watched message no query on
 * screen shows the attempts of. Only its attempts' id, time, status and trigger
 * are returned: the payload, which can hold customer data, is dropped as soon
 * as the read answers, so this read never keeps one in memory, and the
 * message's cache entry, if any, keeps its own `gcTime`. A failed read returns
 * no attempt: the watch reads again on its next tick, until its cap.
 */
export async function readAttemptsOffScreen({
  webhookId,
  messageId,
}: WebhookMessageRef): Promise<WatchedAttempt[]> {
  try {
    const message = await getWebhookMessage(webhookId, messageId);

    return (message?.attempts ?? []).map(toWatchedAttempt);
  } catch {
    return [];
  }
}

/**
 * How many attempts, among `attempts`, can be a resend's: settled, not
 * scheduled by the delivery provider, and later, by order, than the newest
 * attempt the detail knew. Each counts once, by id, whichever sources show it.
 *
 * The provider may record an attempt only once it completes, so a new attempt
 * is never waited for in the sending state; one still sending or pending does
 * not count. A resend's attempt is manual: a scheduled retry that follows an
 * attempt the detail knew is never taken for it, while an attempt whose
 * trigger is not reported still counts.
 */
export function countNewSettledAttempts(
  attempts: readonly WatchedAttempt[],
  latestKnownAttempt: KnownAttempt | undefined,
): number {
  const ids = new Set<string>();
  for (const attempt of attempts) {
    if (
      (attempt.status === 'success' || attempt.status === 'fail') &&
      attempt.triggerType !== 'scheduled' &&
      (latestKnownAttempt === undefined ||
        isLaterAttempt(attempt, latestKnownAttempt))
    ) {
      ids.add(attempt.id);
    }
  }

  return ids.size;
}

/**
 * The older of two newest-known attempts, by order. No known attempt is the
 * oldest of all: from it, every settled attempt counts.
 */
export function getEarlierKnownAttempt(
  left: KnownAttempt | undefined,
  right: KnownAttempt | undefined,
): KnownAttempt | undefined {
  if (left === undefined || right === undefined) {
    return undefined;
  }

  return isLaterAttempt(left, right) ? right : left;
}

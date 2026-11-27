import type { QueryClient } from '@tanstack/react-query';
import {
  isLastingWebhookMessageRefusal,
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

export type KnownAttempt = Pick<WebhookMessageAttempt, 'id' | 'timestamp'>;

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
 * Whether a query on screen shows every attempt the watch waits for, and so is
 * read again by the watch's invalidation: the message's own query, or, for a
 * message resent once, a list read with attempts that holds the message with
 * its last attempt. A list carries the last attempt only, which cannot show two
 * resends' attempts, and saas-api leaves it out of a message its window of
 * attempts does not cover. The row's strip reads its list without attempts, so
 * it never counts.
 */
export function isShownWithAttempts(
  queryClient: QueryClient,
  { webhookId, messageId }: WebhookMessageRef,
  resends: number,
): boolean {
  const message = queryClient.getQueriesData({
    queryKey: webhookMessageQueryOptions(webhookId, messageId).queryKey,
    exact: true,
    type: 'active',
  });
  if (message.length > 0) {
    return true;
  }
  if (resends > 1) {
    return false;
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
          (summary) =>
            summary.messageId === messageId &&
            summary.lastAttempt !== undefined,
        ),
    );
}

/** What a read outside the cache answers when a later read would be refused too. */
export const REFUSED = 'refused';

/**
 * Reads a message outside the query cache, for a watched message no query on
 * screen shows the attempts of. Only its attempts' id, time, status and trigger
 * are returned: the payload, which can hold customer data, is dropped as soon
 * as the read answers, so this read never keeps one in memory, and the
 * message's cache entry, if any, keeps its own `gcTime`. A 403, or a 404 other
 * than a message not delivered yet (its webhook deleted, say), returns
 * `REFUSED`, which ends the message's watch. Any other failed read, one aborted
 * through `signal` included, returns no attempt: the watch reads again on its
 * next tick, until its cap.
 */
export async function readAttemptsOffScreen(
  { webhookId, messageId }: WebhookMessageRef,
  signal?: AbortSignal,
): Promise<WatchedAttempt[] | typeof REFUSED> {
  try {
    const message = await getWebhookMessage(webhookId, messageId, { signal });

    return (message?.attempts ?? []).map(toWatchedAttempt);
  } catch (error) {
    return isLastingWebhookMessageRefusal(error) ? REFUSED : [];
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

/** The newest of the attempts given, by order, keeping only its id and time. */
export function getNewestKnownAttempt(
  attempts: readonly (KnownAttempt | undefined)[],
): KnownAttempt | undefined {
  let newest: KnownAttempt | undefined;
  for (const attempt of attempts) {
    if (
      attempt !== undefined &&
      (newest === undefined || isLaterAttempt(attempt, newest))
    ) {
      newest = { id: attempt.id, timestamp: attempt.timestamp };
    }
  }

  return newest;
}

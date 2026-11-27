import type { QueryClient } from '@tanstack/react-query';
import { webhookDetailBaseQueryKey } from './webhook-detail-query-options';
import { webhookHistoryQueryOptions } from './webhook-history-query-options';
import {
  webhookMessageBaseQueryKey,
  webhookMessageQueryOptions,
} from './webhook-message-query-options';
import { webhookMessagesListBaseQueryKey } from './webhook-messages-query-options';
import { webhooksQueryOptions } from './webhooks-query-options';

/**
 * After a create, an update or a delete: the list of webhooks and the history
 * (both exact), and every webhook's detail (by prefix, so a revealed secret is
 * read again). Not the deliveries: `['webhooks']` is also the prefix of the
 * message lists and messages, which these writes do not change, and each
 * visible row reads its own list.
 */
export async function invalidateWebhookQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: webhooksQueryOptions.queryKey,
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: webhookHistoryQueryOptions.queryKey,
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: webhookDetailBaseQueryKey,
    }),
  ]);
}

/**
 * After a delete: forgets the webhook's detail, message lists and messages,
 * so that nothing reads them again and a payload leaves memory at once.
 */
export function removeWebhookQueries(
  queryClient: QueryClient,
  webhookId: string,
) {
  queryClient.removeQueries({
    queryKey: [...webhookDetailBaseQueryKey, webhookId],
  });
  queryClient.removeQueries({
    queryKey: [...webhookMessagesListBaseQueryKey, webhookId],
  });
  queryClient.removeQueries({
    queryKey: [...webhookMessageBaseQueryKey, webhookId],
  });
}

/** A message of a webhook, as the resend watch names it. */
export interface WebhookMessageRef {
  webhookId: string;
  messageId: string;
}

/**
 * After a resend: the history, the webhook's message lists and the message
 * itself. Not the list of webhooks, which a delivery does not change. Only the
 * queries on screen refetch; the others are marked stale.
 */
export async function invalidateWebhookDeliveryQueries(
  queryClient: QueryClient,
  webhookId: string,
  messageId: string,
) {
  await invalidateWatchedDeliveryQueries(queryClient, [
    { webhookId, messageId },
  ]);
}

/**
 * On each read of the resend watch (`useDeliveryWatch`), for every message it
 * follows: the history once, the message lists of each of their webhooks once,
 * and each message. Only the queries on screen refetch; the others are marked
 * stale, so a message shown again later is read at once.
 */
export async function invalidateWatchedDeliveryQueries(
  queryClient: QueryClient,
  messages: readonly WebhookMessageRef[],
) {
  const webhookIds = new Set(messages.map(({ webhookId }) => webhookId));

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: webhookHistoryQueryOptions.queryKey,
      exact: true,
    }),
    ...[...webhookIds].map((webhookId) =>
      queryClient.invalidateQueries({
        queryKey: [...webhookMessagesListBaseQueryKey, webhookId],
      }),
    ),
    ...messages.map(({ webhookId, messageId }) =>
      queryClient.invalidateQueries({
        queryKey: webhookMessageQueryOptions(webhookId, messageId).queryKey,
        exact: true,
      }),
    ),
  ]);
}

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
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: webhookHistoryQueryOptions.queryKey,
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: [...webhookMessagesListBaseQueryKey, webhookId],
    }),
    queryClient.invalidateQueries({
      queryKey: webhookMessageQueryOptions(webhookId, messageId).queryKey,
      exact: true,
    }),
  ]);
}

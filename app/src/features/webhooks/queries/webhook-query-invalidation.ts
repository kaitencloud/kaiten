import type { QueryClient } from '@tanstack/react-query';
import { webhookHistoryQueryOptions } from './webhook-history-query-options';
import { webhookMessageQueryOptions } from './webhook-message-query-options';
import { webhookMessagesListBaseQueryKey } from './webhook-messages-query-options';
import { webhooksQueryOptions } from './webhooks-query-options';

export async function invalidateWebhookQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: webhooksQueryOptions.queryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: webhookHistoryQueryOptions.queryKey,
    }),
  ]);
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

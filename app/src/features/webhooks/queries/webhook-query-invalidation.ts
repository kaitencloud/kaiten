import type { QueryClient } from '@tanstack/react-query';
import { webhookHistoryQueryOptions } from './webhook-history-query-options';
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

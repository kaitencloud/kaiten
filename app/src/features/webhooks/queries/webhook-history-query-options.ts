import { queryOptions } from '@tanstack/react-query';
import { getWebhookHistory } from '../webhooks.api';

export const webhookHistoryBaseQueryKey = ['webhooks', 'history'] as const;

export const webhookHistoryQueryOptions = queryOptions({
  queryKey: webhookHistoryBaseQueryKey,
  queryFn: getWebhookHistory,
});

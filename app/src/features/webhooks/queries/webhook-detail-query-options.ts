import { queryOptions } from '@tanstack/react-query';
import { getWebhook } from '../webhooks.api';

export const webhookDetailBaseQueryKey = ['webhooks', 'detail'] as const;

export const webhookDetailQueryOptions = (webhookId: string) =>
  queryOptions({
    queryKey: [...webhookDetailBaseQueryKey, webhookId] as const,
    queryFn: () => getWebhook(webhookId),
    staleTime: Number.POSITIVE_INFINITY,
  });

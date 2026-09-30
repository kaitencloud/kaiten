import { queryOptions } from '@tanstack/react-query';
import { getWebhooks } from '../webhooks.api';

export const webhooksBaseQueryKey = ['webhooks'] as const;

export const webhooksQueryOptions = queryOptions({
  queryKey: webhooksBaseQueryKey,
  queryFn: getWebhooks,
});

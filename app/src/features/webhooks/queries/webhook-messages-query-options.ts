import { type QueryKey, queryOptions } from '@tanstack/react-query';
import { getWebhookMessages } from '../webhooks.api';

/**
 * A second segment of its own, so that invalidating one webhook's message
 * lists never reaches the messages read one by one
 * (`webhookMessageBaseQueryKey`), while `['webhooks']` still reaches both.
 */
export const webhookMessagesListBaseQueryKey = [
  'webhooks',
  'messages-list',
] as const;

export interface WebhookMessagesListParams {
  limit: number;
  withAttempts: boolean;
}

/**
 * A webhook's most recent messages. The table reads one list per visible row,
 * so a refused or failing read is retried once, not three times, and coming
 * back to the window does not refetch every row at once.
 */
export const webhookMessagesQueryOptions = (
  webhookId: string,
  { limit, withAttempts }: WebhookMessagesListParams,
) =>
  queryOptions({
    queryKey: [
      ...webhookMessagesListBaseQueryKey,
      webhookId,
      limit,
      withAttempts,
    ] as const,
    queryFn: () => getWebhookMessages(webhookId, { limit, withAttempts }),
    refetchOnWindowFocus: false,
    retry: 1,
  });

/**
 * Whether a message list's key, as `webhookMessagesQueryOptions` writes it,
 * reads the messages with their attempts.
 */
export function isMessagesListReadWithAttempts(queryKey: QueryKey): boolean {
  return queryKey[4] === true;
}

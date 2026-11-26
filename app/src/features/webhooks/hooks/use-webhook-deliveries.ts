import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  type WebhookMessagesListParams,
  webhookMessagesQueryOptions,
} from '../queries';
import type {
  WebhookDelivery,
  WebhookMessageCounts,
  WebhookMessageList,
} from '../types';
import { mapMessageSummaryToDelivery } from '../utils/webhook-deliveries';

export interface WebhookDeliveries {
  webhook: WebhookMessageList['webhook'];
  /** Newest first, one per message. */
  deliveries: WebhookDelivery[];
  summary: WebhookMessageCounts;
  hasMore: boolean;
}

/**
 * A webhook's most recent deliveries, read without suspending: the table and
 * the dialog draw a skeleton meanwhile. `isError` is true only while there is
 * nothing to show, since a failed background refetch keeps the last good data.
 */
export function useWebhookDeliveries(
  webhookId: string,
  {
    limit,
    withAttempts,
    refetchInterval,
  }: WebhookMessagesListParams & { refetchInterval?: () => number | false },
) {
  const select = useCallback(
    (list: WebhookMessageList): WebhookDeliveries => ({
      webhook: list.webhook,
      deliveries: (list.messages ?? []).map((message) =>
        mapMessageSummaryToDelivery(message, webhookId),
      ),
      summary: list.summary,
      hasMore: list.hasMore,
    }),
    [webhookId],
  );
  const query = useQuery({
    ...webhookMessagesQueryOptions(webhookId, { limit, withAttempts }),
    select,
    refetchInterval,
  });

  return {
    data: query.data,
    error: query.error,
    isError: query.isError && query.data === undefined,
    isPending: query.isPending,
    refetch: query.refetch,
  };
}

import type { QueryClient } from '@tanstack/react-query';
import type { ApiWebhook } from '../types';
import { webhookDetailQueryOptions } from './webhook-detail-query-options';
import { webhooksQueryOptions } from './webhooks-query-options';

/**
 * The webhook the edit page opens. The form needs its URL and events, not its
 * secret, so the list entry serves; a webhook the list does not carry (a deep
 * link on a cold cache, or an organization with more endpoints than the one
 * page the list reads) is read by id. That read is infinitely fresh in the
 * cache, so it is asked again here. A webhook that does not exist rejects with
 * the API's 404, which the router shows as the not-found page.
 */
export async function loadWebhookForEdit(
  queryClient: QueryClient,
  webhookId: string,
): Promise<ApiWebhook> {
  const list = await queryClient.ensureQueryData(webhooksQueryOptions);
  const listed = list.find((webhook) => webhook.id === webhookId);

  return (
    listed ??
    queryClient.fetchQuery({
      ...webhookDetailQueryOptions(webhookId),
      staleTime: 0,
    })
  );
}

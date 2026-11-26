import { queryOptions } from '@tanstack/react-query';
import {
  isApiError,
  isForbiddenError,
  isNotFoundError,
  isProblem,
} from '@/lib/errors';
import { getWebhookMessage } from '../webhooks.api';

export const webhookMessageBaseQueryKey = ['webhooks', 'messages'] as const;

/**
 * What saas-api answers for a message it does not see delivered to the
 * webhook. Right after an event is published, a message the list already
 * shows can be in that state for a few seconds, before its first attempt.
 */
export const WEBHOOK_MESSAGE_NOT_DELIVERED = 'GetWebhookMessage.NotDelivered';

/**
 * The `code` of the problem saas-api refused with. `getProblemCode` of
 * `@/domains/billing` reads the same, but its barrel loads the billing queries,
 * which a webhooks query has no use for.
 */
function getProblemCode(error: unknown): string | undefined {
  return isApiError(error) && isProblem(error.data)
    ? error.data.code
    : undefined;
}

/** Keep a payload, which can hold customer data, in memory no longer than needed. */
const WEBHOOK_MESSAGE_GC_TIME_MS = 60_000;

/**
 * Whether to read a message again after a failure. A message the list showed
 * and that is not delivered yet gets one more read; any other 404, and a 403,
 * is the answer; anything else gets two more reads.
 */
export function shouldRetryWebhookMessage(
  failureCount: number,
  error: unknown,
  { retryNotDelivered }: { retryNotDelivered: boolean },
): boolean {
  if (getProblemCode(error) === WEBHOOK_MESSAGE_NOT_DELIVERED) {
    return retryNotDelivered && failureCount < 1;
  }
  if (isNotFoundError(error) || isForbiddenError(error)) {
    return false;
  }

  return failureCount < 2;
}

/**
 * One message of a webhook. `retryNotDelivered` is for a message that came
 * from the webhook's message list (see `WEBHOOK_MESSAGE_NOT_DELIVERED`); a
 * message named by the history has an attempt, so it was delivered.
 */
export const webhookMessageQueryOptions = (
  webhookId: string,
  messageId: string,
  { retryNotDelivered = false }: { retryNotDelivered?: boolean } = {},
) =>
  queryOptions({
    queryKey: [...webhookMessageBaseQueryKey, webhookId, messageId] as const,
    queryFn: () => getWebhookMessage(webhookId, messageId),
    gcTime: WEBHOOK_MESSAGE_GC_TIME_MS,
    retry: (failureCount, error) =>
      shouldRetryWebhookMessage(failureCount, error, { retryNotDelivered }),
  });

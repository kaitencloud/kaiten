import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage, isApiError } from '@/lib/errors';
import {
  invalidateWebhookDeliveryQueries,
  webhookMessageQueryOptions,
} from '../queries';
import { resendWebhookMessage } from '../webhooks.api';

const DETAIL_KEY = 'Pages.Integrations.Webhooks.Deliveries.Detail';

interface ResendVariables {
  webhookId: string;
  messageId: string;
}

/** A refusal that means the message can no longer be resent. */
function isGoneRefusal(error: unknown): boolean {
  return isApiError(error) && (error.status === 409 || error.status === 404);
}

/**
 * The toast of a refused resend. saas-api writes its details in English, so
 * the two refusals a person meets are said in the console's language: 409, the
 * payload is gone; 404, the message is no longer delivered to the webhook.
 */
export function getResendErrorMessage(error: unknown, t: TFunction): string {
  if (isApiError(error) && error.status === 409) {
    return t(`${DETAIL_KEY}.resendPayloadUnavailable`);
  }
  if (isApiError(error) && error.status === 404) {
    return t(`${DETAIL_KEY}.resendNotDelivered`);
  }

  return getApiErrorMessage(error);
}

/**
 * Resends a message to a webhook. On success `onQueued` runs (the detail arms
 * its `useDeliveryWatch` there), then the deliveries are read again at once. A
 * message that can no longer be resent is read again, so the detail shows why.
 */
export function useResendWebhookMessage({
  onQueued,
}: {
  onQueued: () => void;
}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ webhookId, messageId }: ResendVariables) =>
      resendWebhookMessage(webhookId, messageId),
    onSuccess: async (_data, { webhookId, messageId }) => {
      onQueued();
      toast.success(t(`${DETAIL_KEY}.resendQueued`));
      await invalidateWebhookDeliveryQueries(queryClient, webhookId, messageId);
    },
    onError: async (error, { webhookId, messageId }) => {
      toast.error(getResendErrorMessage(error, t));
      if (isGoneRefusal(error)) {
        await queryClient.invalidateQueries({
          queryKey: webhookMessageQueryOptions(webhookId, messageId).queryKey,
          exact: true,
        });
      }
    },
  });
}

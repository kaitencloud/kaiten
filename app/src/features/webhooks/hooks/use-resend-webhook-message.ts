import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage, isNotFoundError } from '@/lib/errors';
import {
  getProblemCode,
  invalidateWebhookDeliveryQueries,
  webhookMessageQueryOptions,
} from '../queries';
import { resendWebhookMessage } from '../webhooks.api';

const DETAIL_KEY = 'Pages.Integrations.Webhooks.Deliveries.Detail';

interface ResendVariables {
  webhookId: string;
  messageId: string;
}

// The 409s and the 503 of a resend, told apart by their code: a 409 is either a
// payload that is gone or a resend the delivery provider refused, which says
// nothing of the payload.
const PAYLOAD_UNAVAILABLE = 'ResendWebhookMessage.PayloadUnavailable';
const REFUSED = 'ResendWebhookMessage.Refused';
const UNAVAILABLE = 'ResendWebhookMessage.Unavailable';

const RESEND_REFUSAL_KEYS = new Map<string | undefined, string>([
  [PAYLOAD_UNAVAILABLE, 'resendPayloadUnavailable'],
  [REFUSED, 'resendRefused'],
  [UNAVAILABLE, 'resendUnavailable'],
]);

/**
 * A refusal about this message, after which it is read again so the detail is
 * current: its payload is gone (409 `PayloadUnavailable`), which the read
 * shows; the delivery provider refused to resend it (409 `Refused`), for a
 * cause it does not name, though a body that expired meanwhile would show; or
 * it is not there to resend (404: `NotDelivered`, or its webhook or the message
 * no longer found). The provider being busy (503 `Unavailable`) says nothing
 * about the message, so it is not read again.
 */
function isMessageRefusal(error: unknown): boolean {
  const code = getProblemCode(error);

  return (
    code === PAYLOAD_UNAVAILABLE || code === REFUSED || isNotFoundError(error)
  );
}

/**
 * The toast of a refused resend. saas-api writes its details in English, so
 * the refusals a person meets are said in the console's language: a 409 or a
 * 503 by the problem's `code`, never by its status alone, and every 404 as a
 * delivery that can no longer be resent (`NotDelivered`, or its webhook or the
 * message removed). Any other refusal shows what the API wrote.
 */
export function getResendErrorMessage(error: unknown, t: TFunction): string {
  if (isNotFoundError(error)) {
    return t(`${DETAIL_KEY}.resendNotDelivered`);
  }
  const key = RESEND_REFUSAL_KEYS.get(getProblemCode(error));

  return key === undefined
    ? getApiErrorMessage(error)
    : t(`${DETAIL_KEY}.${key}`);
}

/**
 * Resends a message to a webhook. On success `onQueued` runs (the detail arms
 * its `useDeliveryWatch` there), then the deliveries are read again at once. A
 * message whose resend was refused is read again, so the detail is current (see
 * `isMessageRefusal`).
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
      if (isMessageRefusal(error)) {
        await queryClient.invalidateQueries({
          queryKey: webhookMessageQueryOptions(webhookId, messageId).queryKey,
          exact: true,
        });
      }
    },
  });
}

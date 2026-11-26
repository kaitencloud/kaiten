import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import type { WebhookInput } from '../types';
import { webhookToBody } from '../utils/webhook-form-values';
import { getWebhook, updateWebhook } from '../webhooks.api';

export type SaveWebhookVariables = {
  webhookId: string;
  /** What the form sends, built from what it holds now. */
  edited: WebhookInput;
  /** What the form opened with, built by the function that built `edited`. */
  opened: WebhookInput;
};

/**
 * Updates a webhook without overwriting what changed since the form opened.
 * `PUT /webhooks/{id}` replaces the URL and the events together, so the webhook
 * is read again and the form's changes are applied on top of it
 * (`writeOnFresh`). A webhook deleted meanwhile is refused by the read (404),
 * and nothing is written.
 */
export function saveWebhookOnFresh({
  webhookId,
  edited,
  opened,
}: SaveWebhookVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: () => getWebhook(webhookId, FRESH_READ_OPTIONS),
    restate: webhookToBody,
    write: (body) => updateWebhook(webhookId, body),
  });
}

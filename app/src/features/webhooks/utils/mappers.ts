import type { ApiWebhook, Webhook } from '../types';

export const mapApiWebhookToWebhook = (webhook: ApiWebhook): Webhook => ({
  id: webhook.id,
  eventTypes: webhook.eventTypes ?? [],
  url: webhook.url,
  signingSecret: webhook.signingSecret,
  createdAt: webhook.createdAt ?? '',
});

export const mapApiWebhooksToWebhooks = (
  webhooks: ApiWebhook[] | null | undefined,
): Webhook[] => (webhooks ?? []).map(mapApiWebhookToWebhook);

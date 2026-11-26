import type { ApiWebhook, Webhook } from '../types';

// Go's `time.Time.String()`, which saas-api sent a webhook's dates in before
// RFC 3339: "2026-02-25 10:11:12.123456 +0000 UTC". Only V8 parses it.
const GO_TIME_STRING =
  /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?) ([+-]\d{2})(\d{2})(?: [A-Za-z]+)?$/;

/**
 * A webhook's date as RFC 3339. saas-api sends RFC 3339; an older one sent Go's
 * `time.String()` text, restated here so every browser reads it and the
 * Created column sorts the same either way. Anything else is kept as is.
 */
export function normalizeWebhookTimestamp(value: string): string {
  const match = GO_TIME_STRING.exec(value.trim());
  if (!match) {
    return value;
  }
  const [, date, time, hours, minutes] = match;

  return `${date}T${time}${hours}:${minutes}`;
}

export const mapApiWebhookToWebhook = (webhook: ApiWebhook): Webhook => ({
  id: webhook.id,
  eventTypes: webhook.eventTypes ?? [],
  url: webhook.url,
  signingSecret: webhook.signingSecret,
  createdAt: webhook.createdAt
    ? normalizeWebhookTimestamp(webhook.createdAt)
    : '',
});

export const mapApiWebhooksToWebhooks = (
  webhooks: ApiWebhook[] | null | undefined,
): Webhook[] => (webhooks ?? []).map(mapApiWebhookToWebhook);

import { isSameField } from '@/lib/api/fresh-write';
import type { WebhookFormValues } from '../schemas';
import type { ApiWebhook, WebhookInput } from '../types';
import { sortEventTypes } from './webhook-event-selection';

// The create and edit page builds the body of a webhook from its values, and
// restates a webhook read from the API as the same body, with the same
// normalisation: the URL trimmed, the events in the selection's canonical
// order. Comparing what the form opened with to what the API holds now is then
// sound (writeOnFresh compares arrays in order).

/**
 * The values the form opens with for a webhook. A webhook without a filter has
 * no events and keeps receiving every event until the form says otherwise.
 */
export function webhookToFormValues(webhook: ApiWebhook): WebhookFormValues {
  const eventTypes = sortEventTypes(webhook.eventTypes);

  return {
    keepEveryEvent: eventTypes.length === 0,
    eventTypes,
    url: webhook.url,
  };
}

/**
 * The body the API receives for the form's values. A webhook that keeps
 * receiving every event is sent an empty `eventTypes`, whatever events were
 * ticked while the box was off: saas-api reads it as "keep no filter".
 */
export function formValuesToBody(values: WebhookFormValues): WebhookInput {
  return {
    eventTypes: values.keepEveryEvent ? [] : sortEventTypes(values.eventTypes),
    url: values.url.trim(),
  };
}

/** A webhook read from the API, restated as the body the form would send. */
export function webhookToBody(webhook: ApiWebhook): WebhookInput {
  return formValuesToBody(webhookToFormValues(webhook));
}

/**
 * Whether the form's values would send what it opened with. It compares the
 * bodies, not the values: events ticked while "keep every event" is on are
 * not sent, and so are no change.
 */
export function isUnchangedWebhook(
  values: WebhookFormValues,
  opened: WebhookFormValues,
): boolean {
  return isSameField(formValuesToBody(values), formValuesToBody(opened));
}

/**
 * What a breadcrumb or a label may say of a webhook: the host of its URL, or its
 * id. Never the whole URL: a Slack or Google Chat URL is a credential.
 */
export function webhookDisplayName(
  webhook: Pick<ApiWebhook, 'id' | 'url'>,
): string {
  try {
    return new URL(webhook.url).host || webhook.id;
  } catch {
    return webhook.id;
  }
}

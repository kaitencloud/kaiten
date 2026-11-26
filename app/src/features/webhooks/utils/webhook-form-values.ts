import type { CreateWebhookFormValues } from '../schemas';
import type { ApiWebhook, CreateWebhookInput } from '../types';
import { sortEventTypes } from './webhook-event-selection';

// The create and edit page builds the body of a webhook from its values, and
// restates a webhook read from the API as the same body, with the same
// normalisation: the URL trimmed, the events in the selection's canonical
// order. Comparing what the form opened with to what the API holds now is then
// sound (writeOnFresh compares arrays in order).

/** The values the form opens with for a webhook. A webhook without a filter has no events. */
export function webhookToFormValues(
  webhook: ApiWebhook,
): CreateWebhookFormValues {
  return {
    eventTypes: sortEventTypes(webhook.eventTypes),
    url: webhook.url,
  };
}

/** The body the API receives for the form's values. */
export function formValuesToBody(
  values: CreateWebhookFormValues,
): CreateWebhookInput {
  return {
    eventTypes: sortEventTypes(values.eventTypes),
    url: values.url.trim(),
  };
}

/** A webhook read from the API, restated as the body the form would send. */
export function webhookToBody(webhook: ApiWebhook): CreateWebhookInput {
  return formValuesToBody(webhookToFormValues(webhook));
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

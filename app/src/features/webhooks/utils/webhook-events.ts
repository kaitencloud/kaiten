import type { TFunction } from 'i18next';
import { type AuditEventName, resolveEventLabel } from '@/domains/audit-trail';
import {
  WEBHOOK_EVENT_GROUPS,
  WEBHOOK_EVENTS,
  type WebhookEventGroup,
  type WebhookEventType,
} from './webhook-event-catalogue';

/** One event as the webhook pages show it. */
export interface WebhookEvent {
  name: AuditEventName;
  type: WebhookEventType;
  group: WebhookEventGroup | null;
}

const ALL_WEBHOOK_EVENTS: WebhookEvent[] = (
  Object.keys(WEBHOOK_EVENTS) as AuditEventName[]
).map((name) => ({
  name,
  type: WEBHOOK_EVENTS[name].type,
  group: WEBHOOK_EVENTS[name].group,
}));

const WEBHOOK_EVENT_BY_TYPE = new Map<string, WebhookEvent>(
  ALL_WEBHOOK_EVENTS.map((event) => [event.type, event]),
);

/** The events the subscription dialog offers, by group, in display order. */
export const SUBSCRIBABLE_WEBHOOK_EVENTS = WEBHOOK_EVENT_GROUPS.map(
  (group) => ({
    group,
    events: ALL_WEBHOOK_EVENTS.filter((event) => event.group === group),
  }),
);

/**
 * The event a subscription or a delivery names by its type, or undefined for a
 * type this build does not know: an event newer than the console, or a type a
 * subscription made before types were checked still carries.
 */
export const getWebhookEvent = (type: string): WebhookEvent | undefined =>
  WEBHOOK_EVENT_BY_TYPE.get(type);

/**
 * The event's label in the viewer's language -- the one the audit trail shows
 * -- or the type itself for an event this build does not know.
 */
export const getWebhookEventLabel = (type: string, t: TFunction): string => {
  const event = getWebhookEvent(type);
  return event ? resolveEventLabel(event.name, t) : type;
};

/** The title of a group; null is the group of the events this build does not know. */
export const getWebhookEventGroupLabel = (
  group: WebhookEventGroup | null,
  t: TFunction,
): string => t(`Pages.Integrations.Webhooks.EventGroups.${group ?? 'other'}`);

/** A group label and an event label, as the history's event filter lists them. */
export const getWebhookEventOptionLabel = (
  type: string,
  t: TFunction,
): string => {
  const event = getWebhookEvent(type);
  return event
    ? `${getWebhookEventGroupLabel(event.group, t)} – ${resolveEventLabel(event.name, t)}`
    : type;
};

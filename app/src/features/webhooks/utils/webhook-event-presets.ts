import {
  WEBHOOK_EVENTS,
  type WebhookEventGroup,
} from './webhook-event-catalogue';
import { sortEventTypes } from './webhook-event-selection';
import { SUBSCRIBABLE_WEBHOOK_EVENTS } from './webhook-events';

// The preset pills of the event picker. Each is defined by catalogue names or
// groups, so a renamed event fails typecheck here, and resolved to types.
// The three are disjoint. What each leaves out is on purpose, and the presets'
// unit test lists it, so that a new event of their groups forces a decision:
//
// - Instance lifecycle leaves out the three entitlement-exception events that
//   share the `instance` group.
// - Billing is the money flow: subscriptions, invoices and payments. Add-ons and
//   vouchers are catalogue configuration, and checkout payloads carry the
//   visitor's e-mail, so checkout stays an explicit choice.
// - Usage alerts leaves out ENTITLEMENT_USAGE_REPORT_ACCEPTED (one per accepted
//   report, and every delivered event counts against the `webhooks` quota) and
//   INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER (routine).

export const WEBHOOK_EVENT_PRESET_IDS = [
  'instanceLifecycle',
  'billing',
  'usageAlerts',
] as const;

export type WebhookEventPresetId = (typeof WEBHOOK_EVENT_PRESET_IDS)[number];

type WebhookEventName = keyof typeof WEBHOOK_EVENTS;

interface PresetDefinition {
  names?: readonly WebhookEventName[];
  groups?: readonly WebhookEventGroup[];
}

const PRESET_DEFINITIONS: Record<WebhookEventPresetId, PresetDefinition> = {
  instanceLifecycle: {
    names: [
      'INSTANCE_CREATED',
      'INSTANCE_UPDATED',
      'INSTANCE_DELETED',
      'INSTANCE_DEPLOYED',
      'INSTANCE_MIGRATED',
      'INSTANCE_STATUS_CHANGED',
      'INSTANCE_LIFECYCLE_STAGE_CHANGED',
    ],
  },
  billing: { groups: ['subscription', 'invoice', 'payment'] },
  usageAlerts: {
    names: [
      'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
      'INSTANCE_ENTITLEMENT_USAGE_REACHED',
      'INSTANCE_ENTITLEMENT_CAP_EXCEEDED',
      'INSTANCE_ENTITLEMENT_MAXIMUM_EXCEEDED',
      'INSTANCE_AI_MODEL_USAGE_UNAUTHORIZED',
      'ENTITLEMENT_USAGE_REPORT_REJECTED',
    ],
  },
};

function resolvePreset({ names = [], groups = [] }: PresetDefinition) {
  const byName = names.map((name) => WEBHOOK_EVENTS[name].type as string);
  const byGroup = SUBSCRIBABLE_WEBHOOK_EVENTS.filter((entry) =>
    groups.includes(entry.group),
  ).flatMap((entry) => entry.events.map((event) => event.type as string));

  return sortEventTypes([...byName, ...byGroup]);
}

/** The event types of each preset, in the selection's canonical order. */
export const WEBHOOK_EVENT_PRESETS: Record<
  WebhookEventPresetId,
  readonly string[]
> = {
  instanceLifecycle: resolvePreset(PRESET_DEFINITIONS.instanceLifecycle),
  billing: resolvePreset(PRESET_DEFINITIONS.billing),
  usageAlerts: resolvePreset(PRESET_DEFINITIONS.usageAlerts),
};

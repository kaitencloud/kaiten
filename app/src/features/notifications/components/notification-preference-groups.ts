import {
  AlertTriangle,
  Bell,
  Building2,
  KeyRound,
  type LucideIcon,
  Plug,
  Rocket,
  Server,
  ShieldAlert,
} from 'lucide-react';
import type { EventNameMap, KaitenEventName, PreferenceEvent } from '../types';

// Frontend presentation over the flat PreferenceMatrix event list: the server
// owns event names, labels and which group an event belongs to; the client owns
// what a group is called and how it reads. A group id the client does not know
// yet falls back to "other", so a catalogue addition never disappears from the
// settings page.

export interface PreferenceGroupDef {
  id: string;
  Icon: LucideIcon;
  labelKey: string;
  labelFallback: string;
  descriptionKey: string;
  descriptionFallback: string;
}

const GROUP_DEFS: PreferenceGroupDef[] = [
  {
    id: 'deployments',
    Icon: Rocket,
    labelKey: 'Pages.Settings.Notifications.Groups.deployments.label',
    labelFallback: 'Deployments & releases',
    descriptionKey:
      'Pages.Settings.Notifications.Groups.deployments.description',
    descriptionFallback: 'Release lifecycle across your instances.',
  },
  {
    id: 'instances',
    Icon: Server,
    labelKey: 'Pages.Settings.Notifications.Groups.instances.label',
    labelFallback: 'Instances',
    descriptionKey: 'Pages.Settings.Notifications.Groups.instances.description',
    descriptionFallback: 'Provisioning and lifecycle of customer instances.',
  },
  {
    id: 'usage',
    Icon: AlertTriangle,
    labelKey: 'Pages.Settings.Notifications.Groups.usage.label',
    labelFallback: 'Usage & limits',
    descriptionKey: 'Pages.Settings.Notifications.Groups.usage.description',
    descriptionFallback: 'Entitlement consumption against thresholds.',
  },
  {
    id: 'integrations',
    Icon: Plug,
    labelKey: 'Pages.Settings.Notifications.Groups.integrations.label',
    labelFallback: 'Integrations',
    descriptionKey:
      'Pages.Settings.Notifications.Groups.integrations.description',
    descriptionFallback: 'Outbound webhooks and connector syncs.',
  },
  {
    id: 'customers',
    Icon: Building2,
    labelKey: 'Pages.Settings.Notifications.Groups.customers.label',
    labelFallback: 'Customers',
    descriptionKey: 'Pages.Settings.Notifications.Groups.customers.description',
    descriptionFallback: 'Customer records and onboarding outcomes.',
  },
  {
    id: 'licensing',
    Icon: KeyRound,
    labelKey: 'Pages.Settings.Notifications.Groups.licensing.label',
    labelFallback: 'Licensing',
    descriptionKey: 'Pages.Settings.Notifications.Groups.licensing.description',
    descriptionFallback: 'Licenses and the entitlements attached to them.',
  },
  {
    id: 'security',
    Icon: ShieldAlert,
    labelKey: 'Pages.Settings.Notifications.Groups.security.label',
    labelFallback: 'Security',
    descriptionKey: 'Pages.Settings.Notifications.Groups.security.description',
    descriptionFallback: 'Credentials issued against your organization.',
  },
  {
    id: 'other',
    Icon: Bell,
    labelKey: 'Pages.Settings.Notifications.Groups.other.label',
    labelFallback: 'Other',
    descriptionKey: 'Pages.Settings.Notifications.Groups.other.description',
    descriptionFallback: 'Everything not covered by another group.',
  },
];

// Descriptions are the client's, keyed by the event names the server's
// catalogue actually publishes (api/internal/modules/notifications/catalogue).
// An event with no entry here renders with its label alone, which is what makes
// adding one to the catalogue safe without a matching frontend release.
const EVENT_DESCRIPTION_KEYS: EventNameMap<string> = {
  INSTANCE_CREATED: 'Pages.Settings.Notifications.Events.INSTANCE_CREATED',
  INSTANCE_DEPLOYED: 'Pages.Settings.Notifications.Events.INSTANCE_DEPLOYED',
  INSTANCE_DELETED: 'Pages.Settings.Notifications.Events.INSTANCE_DELETED',
  INSTANCE_MIGRATED: 'Pages.Settings.Notifications.Events.INSTANCE_MIGRATED',
  INSTANCE_LIFECYCLE_STAGE_CHANGED:
    'Pages.Settings.Notifications.Events.INSTANCE_LIFECYCLE_STAGE_CHANGED',
  INSTANCE_STATUS_CHANGED:
    'Pages.Settings.Notifications.Events.INSTANCE_STATUS_CHANGED',
  INSTANCE_UPDATED: 'Pages.Settings.Notifications.Events.INSTANCE_UPDATED',
  CUSTOMER_CREATED: 'Pages.Settings.Notifications.Events.CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'Pages.Settings.Notifications.Events.CUSTOMER_UPDATED',
  CUSTOMER_DELETED: 'Pages.Settings.Notifications.Events.CUSTOMER_DELETED',
  CUSTOMER_CREATION_REJECTED:
    'Pages.Settings.Notifications.Events.CUSTOMER_CREATION_REJECTED',
  RELEASE_CREATED: 'Pages.Settings.Notifications.Events.RELEASE_CREATED',
  RELEASE_DEPLOYED: 'Pages.Settings.Notifications.Events.RELEASE_DEPLOYED',
  RELEASE_DELETED: 'Pages.Settings.Notifications.Events.RELEASE_DELETED',
  DEPLOYMENT_ZONE_CREATED:
    'Pages.Settings.Notifications.Events.DEPLOYMENT_ZONE_CREATED',
  DEPLOYMENT_ZONE_DELETED:
    'Pages.Settings.Notifications.Events.DEPLOYMENT_ZONE_DELETED',
  COMPONENT_CREATED: 'Pages.Settings.Notifications.Events.COMPONENT_CREATED',
  COMPONENT_UPDATED: 'Pages.Settings.Notifications.Events.COMPONENT_UPDATED',
  INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED:
    'Pages.Settings.Notifications.Events.INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
  INSTANCE_ENTITLEMENT_USAGE_REACHED:
    'Pages.Settings.Notifications.Events.INSTANCE_ENTITLEMENT_USAGE_REACHED',
  INSTANCE_ENTITLEMENT_CAP_EXCEEDED:
    'Pages.Settings.Notifications.Events.INSTANCE_ENTITLEMENT_CAP_EXCEEDED',
  ENTITLEMENT_USAGE_REPORT_REJECTED:
    'Pages.Settings.Notifications.Events.ENTITLEMENT_USAGE_REPORT_REJECTED',
  INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER:
    'Pages.Settings.Notifications.Events.INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER',
  LICENSE_CREATED: 'Pages.Settings.Notifications.Events.LICENSE_CREATED',
  LICENSE_UPDATED: 'Pages.Settings.Notifications.Events.LICENSE_UPDATED',
  LICENSE_DELETED: 'Pages.Settings.Notifications.Events.LICENSE_DELETED',
  LICENSE_ENTITLEMENT_ASSIGNED:
    'Pages.Settings.Notifications.Events.LICENSE_ENTITLEMENT_ASSIGNED',
  LICENSE_ENTITLEMENT_UNASSIGNED:
    'Pages.Settings.Notifications.Events.LICENSE_ENTITLEMENT_UNASSIGNED',
  SYSTEM_ORGANIZATION_TOKEN_ISSUED:
    'Pages.Settings.Notifications.Events.SYSTEM_ORGANIZATION_TOKEN_ISSUED',
};

const KNOWN_GROUP_IDS = new Set(GROUP_DEFS.map((def) => def.id));

/**
 * The description key for an event, or undefined when this build has no copy
 * for it -- which is the ordinary case for an event added to the catalogue
 * after this frontend shipped.
 */
export function eventDescriptionKey(eventName: string): string | undefined {
  return EVENT_DESCRIPTION_KEYS[eventName as KaitenEventName];
}

export interface PreferenceGroup {
  def: PreferenceGroupDef;
  events: PreferenceEvent[];
}

/**
 * Buckets matrix events into display groups, preserving catalogue order.
 *
 * The group comes from the server, which is the only place that knows it: the
 * catalogue entry that makes an event notifiable is the same one that says what
 * it is about. A second mapping here, keyed by event name, is what this used to
 * be -- and every name in it was a guess made before the backend existed, so
 * every real event fell through to "Other".
 */
export function groupPreferenceEvents(
  events: PreferenceEvent[],
): PreferenceGroup[] {
  const eventsByGroupId = new Map<string, PreferenceEvent[]>();

  for (const event of events) {
    const groupId = KNOWN_GROUP_IDS.has(event.group) ? event.group : 'other';
    const bucket = eventsByGroupId.get(groupId) ?? [];
    bucket.push(event);
    eventsByGroupId.set(groupId, bucket);
  }

  return GROUP_DEFS.flatMap((def) => {
    const grouped = eventsByGroupId.get(def.id);
    return grouped ? [{ def, events: grouped }] : [];
  });
}

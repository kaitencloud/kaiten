import type { EventNameMap, KaitenEventName } from '../types';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Building2,
  KeyRound,
  type LucideIcon,
  Plug,
  Rocket,
  Server,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

export type NotificationTone = 'default' | 'warning' | 'destructive';

export interface NotificationEventMeta {
  Icon: LucideIcon;
  tone: NotificationTone;
}

// Rendering hints only — titles and bodies arrive pre-rendered from the server
// catalogue, and unknown event names must still display (Bell fallback).
//
// Keyed by the event names that catalogue actually publishes
// (api/internal/modules/notifications/catalogue). They were guesses before the
// module existed, and the fallback hid it: every notification rendered as a
// plain bell, which looks like a design choice rather than a broken lookup.
const eventMeta: EventNameMap<NotificationEventMeta> = {
  INSTANCE_CREATED: { Icon: Server, tone: 'default' },
  INSTANCE_DEPLOYED: { Icon: Rocket, tone: 'default' },
  INSTANCE_DELETED: { Icon: Server, tone: 'destructive' },
  INSTANCE_STATUS_CHANGED: { Icon: AlertCircle, tone: 'warning' },
  INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED: {
    Icon: AlertTriangle,
    tone: 'warning',
  },
  INSTANCE_ENTITLEMENT_CAP_EXCEEDED: { Icon: XCircle, tone: 'destructive' },
  INSTANCE_MIGRATED: { Icon: Server, tone: 'default' },
  INSTANCE_LIFECYCLE_STAGE_CHANGED: { Icon: Server, tone: 'default' },
  INSTANCE_UPDATED: { Icon: Server, tone: 'default' },
  CUSTOMER_CREATED: { Icon: Building2, tone: 'default' },
  CUSTOMER_UPDATED: { Icon: Building2, tone: 'default' },
  CUSTOMER_DELETED: { Icon: Building2, tone: 'destructive' },
  CUSTOMER_CREATION_REJECTED: { Icon: AlertCircle, tone: 'destructive' },
  RELEASE_CREATED: { Icon: Rocket, tone: 'default' },
  RELEASE_DEPLOYED: { Icon: Rocket, tone: 'default' },
  RELEASE_DELETED: { Icon: Rocket, tone: 'destructive' },
  DEPLOYMENT_ZONE_CREATED: { Icon: Server, tone: 'default' },
  DEPLOYMENT_ZONE_DELETED: { Icon: Server, tone: 'destructive' },
  COMPONENT_CREATED: { Icon: Plug, tone: 'default' },
  COMPONENT_UPDATED: { Icon: Plug, tone: 'default' },
  INSTANCE_ENTITLEMENT_USAGE_REACHED: { Icon: AlertTriangle, tone: 'warning' },
  ENTITLEMENT_USAGE_REPORT_REJECTED: {
    Icon: AlertCircle,
    tone: 'destructive',
  },
  INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER: {
    Icon: AlertTriangle,
    tone: 'default',
  },
  LICENSE_CREATED: { Icon: KeyRound, tone: 'default' },
  LICENSE_UPDATED: { Icon: KeyRound, tone: 'default' },
  LICENSE_DELETED: { Icon: KeyRound, tone: 'destructive' },
  LICENSE_ENTITLEMENT_ASSIGNED: { Icon: KeyRound, tone: 'default' },
  LICENSE_ENTITLEMENT_UNASSIGNED: { Icon: KeyRound, tone: 'default' },
  SYSTEM_ORGANIZATION_TOKEN_ISSUED: { Icon: ShieldAlert, tone: 'warning' },
};

const fallbackMeta: NotificationEventMeta = { Icon: Bell, tone: 'default' };

export function getNotificationEventMeta(
  eventName: string,
): NotificationEventMeta {
  // The cast is the one place the wire's `string` meets the contract's union.
  // Reads must stay open -- a notification for an event this build has never
  // heard of still has to render -- while writes above stay closed, which is
  // what makes a stale key a build error instead of a silent fallback.
  return eventMeta[eventName as KaitenEventName] ?? fallbackMeta;
}

export const toneIconClass: Record<NotificationTone, string> = {
  default: 'text-primary-subtle-foreground',
  warning: 'text-warning-subtle-foreground',
  destructive: 'text-destructive-subtle-foreground',
};

export const toneUnreadBackgroundClass: Record<NotificationTone, string> = {
  default: 'bg-primary/5',
  warning: 'bg-warning/10',
  destructive: 'bg-destructive/10',
};

export const toneCircleClass: Record<NotificationTone, string> = {
  default: 'bg-primary/10',
  warning: 'bg-warning/10',
  destructive: 'bg-destructive/10',
};

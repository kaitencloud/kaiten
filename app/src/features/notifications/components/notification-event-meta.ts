import type { EventNameMap, KaitenEventName } from '../types';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  type LucideIcon,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { dataModelIcons } from '@/lib/data-model-icons';

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
  INSTANCE_CREATED: { Icon: dataModelIcons.instance, tone: 'default' },
  // An instance event, but what it reports is a release that landed on it.
  INSTANCE_DEPLOYED: { Icon: dataModelIcons.release, tone: 'default' },
  INSTANCE_DELETED: { Icon: dataModelIcons.instance, tone: 'destructive' },
  INSTANCE_STATUS_CHANGED: { Icon: AlertCircle, tone: 'warning' },
  INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED: {
    Icon: AlertTriangle,
    tone: 'warning',
  },
  INSTANCE_ENTITLEMENT_CAP_EXCEEDED: { Icon: XCircle, tone: 'destructive' },
  INSTANCE_MIGRATED: { Icon: dataModelIcons.instance, tone: 'default' },
  INSTANCE_LIFECYCLE_STAGE_CHANGED: {
    Icon: dataModelIcons.instance,
    tone: 'default',
  },
  INSTANCE_UPDATED: { Icon: dataModelIcons.instance, tone: 'default' },
  CUSTOMER_CREATED: { Icon: dataModelIcons.customer, tone: 'default' },
  CUSTOMER_UPDATED: { Icon: dataModelIcons.customer, tone: 'default' },
  CUSTOMER_DELETED: { Icon: dataModelIcons.customer, tone: 'destructive' },
  CUSTOMER_CREATION_REJECTED: { Icon: AlertCircle, tone: 'destructive' },
  RELEASE_CREATED: { Icon: dataModelIcons.release, tone: 'default' },
  RELEASE_DEPLOYED: { Icon: dataModelIcons.release, tone: 'default' },
  RELEASE_DELETED: { Icon: dataModelIcons.release, tone: 'destructive' },
  DEPLOYMENT_ZONE_CREATED: {
    Icon: dataModelIcons.deploymentZone,
    tone: 'default',
  },
  DEPLOYMENT_ZONE_DELETED: {
    Icon: dataModelIcons.deploymentZone,
    tone: 'destructive',
  },
  COMPONENT_CREATED: { Icon: dataModelIcons.component, tone: 'default' },
  COMPONENT_UPDATED: { Icon: dataModelIcons.component, tone: 'default' },
  INSTANCE_ENTITLEMENT_USAGE_REACHED: { Icon: AlertTriangle, tone: 'warning' },
  ENTITLEMENT_USAGE_REPORT_REJECTED: {
    Icon: AlertCircle,
    tone: 'destructive',
  },
  INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER: {
    Icon: AlertTriangle,
    tone: 'default',
  },
  LICENSE_CREATED: { Icon: dataModelIcons.license, tone: 'default' },
  LICENSE_UPDATED: { Icon: dataModelIcons.license, tone: 'default' },
  LICENSE_DELETED: { Icon: dataModelIcons.license, tone: 'destructive' },
  LICENSE_ENTITLEMENT_ASSIGNED: {
    Icon: dataModelIcons.license,
    tone: 'default',
  },
  LICENSE_ENTITLEMENT_UNASSIGNED: {
    Icon: dataModelIcons.license,
    tone: 'default',
  },
  INSTANCE_BILLING_STARTED: { Icon: dataModelIcons.instance, tone: 'default' },
  // As INSTANCE_STATUS_CHANGED: whether it is bad news depends on the new
  // status, and the server notifies by default on the move to PAST_DUE.
  INSTANCE_BILLING_STATUS_CHANGED: { Icon: AlertCircle, tone: 'warning' },
  INSTANCE_BILLING_CANCELED: { Icon: dataModelIcons.instance, tone: 'default' },
  INSTANCE_INVOICE_HELD: { Icon: AlertTriangle, tone: 'warning' },
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

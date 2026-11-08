import type { TFunction } from 'i18next';
import type { DashboardMeter, DashboardSummary } from '@/api-client';
import { daysUntil, formatQuantity } from './format';

export type AttentionTone = 'destructive' | 'warning' | 'info' | 'muted';

/** Where a line leads: a path the router resolves, with the slug in it. */
export type AttentionAction = {
  label: string;
  to: string;
};

export type AttentionLine = {
  id: string;
  tone: AttentionTone;
  count: number;
  title: string;
  detail?: string;
  action?: AttentionAction;
};

export const TOP = 3;

export const instancePath = (slug: string) => `/customers/instances/${slug}`;
export const instanceEntitlementsPath = (slug: string) =>
  `/customers/instances/${slug}/entitlements`;

export const meterMax = (meter: DashboardMeter): string =>
  meter.maxAllowed !== null && meter.maxAllowed !== undefined
    ? formatQuantity(meter.maxAllowed)
    : meter.granted !== null && meter.granted !== undefined
      ? formatQuantity(meter.granted)
      : '∞';

export const meterLabel = (meter: DashboardMeter) =>
  `${meter.customerName} · ${meter.entitlementName} ${formatQuantity(meter.used)}/${meterMax(meter)}`;

export const whenDays = (date: string, t: TFunction): string => {
  const days = daysUntil(date);
  if (days <= 0) {
    return t('Pages.Dashboard.time.today');
  }
  return t('Pages.Dashboard.time.inDays', { count: days });
};

export function pushNotHealthy(
  lines: AttentionLine[],
  summary: DashboardSummary,
  t: TFunction,
) {
  summary.attention.instancesNotHealthy.items.forEach((item) => {
    lines.push({
      id: `status-${item.instanceSlug}`,
      tone: item.status === 'INCIDENT' ? 'destructive' : 'warning',
      count: 1,
      title: t('Pages.Dashboard.attention.lines.notHealthy.title', {
        instance: item.instanceName,
        customer: item.customerName,
        status: (item.status ?? '').toLowerCase(),
      }),
      detail: t('Pages.Dashboard.attention.lines.notHealthy.detail'),
      action: {
        label: t('Pages.Dashboard.attention.lines.notHealthy.action'),
        to: instancePath(item.instanceSlug),
      },
    });
  });
}

export function pushMore(
  lines: AttentionLine[],
  id: string,
  tone: AttentionTone,
  remaining: number,
  t: TFunction,
  to: string,
) {
  if (remaining > 0) {
    lines.push({
      id,
      tone,
      count: remaining,
      title: t('Pages.Dashboard.attention.more', { count: remaining }),
      action: { label: t('Pages.Dashboard.fleet.viewAll'), to },
    });
  }
}

export function billingStatusKey(
  status: string,
): 'renews' | 'trial' | 'pastDue' | 'canceled' {
  switch (status) {
    case 'TRIAL':
      return 'trial';
    case 'PAST_DUE':
      return 'pastDue';
    case 'CANCELED':
      return 'canceled';
    default:
      return 'renews';
  }
}

/** The labels of the checks that ran, for the "also checked" line. */
export function checkedLabels(
  checked: string[],
  t: TFunction,
  withBilling: boolean,
): string[] {
  const labels = checked.map((check) =>
    t(`Pages.Dashboard.attention.checks.${check}`, { defaultValue: check }),
  );
  if (withBilling) {
    labels.push(t('Pages.Dashboard.attention.checks.billing'));
  }
  return labels;
}

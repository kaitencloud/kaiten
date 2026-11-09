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

export type BillingStatusKey =
  | 'renews'
  | 'endsAtPeriodEnd'
  | 'trial'
  | 'pastDue'
  | 'canceled'
  | 'incomplete'
  | 'other';

/**
 * What a subscription says about the License ending: renewing, ending with
 * its period, in trial, past due, canceled, never completed, or a status this
 * console does not know, which it names rather than paints green.
 */
export function billingStatusKey(
  status: string,
  cancelAtPeriodEnd = false,
): BillingStatusKey {
  switch (status) {
    case 'ACTIVE':
      return cancelAtPeriodEnd ? 'endsAtPeriodEnd' : 'renews';
    case 'TRIAL':
      return cancelAtPeriodEnd ? 'endsAtPeriodEnd' : 'trial';
    case 'PAST_DUE':
      return 'pastDue';
    case 'CANCELED':
      return 'canceled';
    case 'INCOMPLETE':
      return 'incomplete';
    default:
      return 'other';
  }
}

/** The words for a License ending's subscription, or for having none. */
export function billingStatusLabel(
  t: TFunction,
  status: string | null | undefined,
  cancelAtPeriodEnd: boolean,
): string {
  if (!status) {
    return t('Pages.Dashboard.comingUp.noSubscription');
  }
  const key = billingStatusKey(status, cancelAtPeriodEnd);
  return key === 'other'
    ? t('Pages.Dashboard.comingUp.other', { status })
    : t(`Pages.Dashboard.comingUp.${key}`);
}

/** The checks the Customers view runs, in the order the card reads them. */
export const CUSTOMERS_CHECKS = [
  'instancesNotHealthy',
  'limitsReached',
  'nearThreshold',
  'silentInstances',
  'licensesEnding30d',
  'archivedVersions',
] as const;

/** The checks the Integration view runs, in the order the card reads them. */
export const INTEGRATION_CHECKS = [
  'rejectedReports24h',
  'limitsReached',
  'nearThreshold',
  'silentInstances',
  'zonesBehind',
  'tokensExpiring30d',
] as const;

type AttentionCheck =
  | (typeof CUSTOMERS_CHECKS)[number]
  | (typeof INTEGRATION_CHECKS)[number];

/**
 * The labels of the checks that ran and found nothing, for the "also checked"
 * line. A check the caller's scopes excluded is absent from `checked` and is
 * not named; one that found something has its lines above and is not repeated.
 * Billing health is a check of its own when the view read it.
 */
export function quietChecks(
  summary: DashboardSummary,
  checks: readonly AttentionCheck[],
  t: TFunction,
  billing?: { checked: boolean; quiet: boolean },
): string[] {
  const labels = checks
    .filter(
      (check) =>
        summary.attention.checked.includes(check) &&
        summary.attention[check].count === 0,
    )
    .map((check) =>
      t(`Pages.Dashboard.attention.checks.${check}`, { defaultValue: check }),
    );
  if (billing?.checked && billing.quiet) {
    labels.push(t('Pages.Dashboard.attention.checks.billing'));
  }
  return labels;
}

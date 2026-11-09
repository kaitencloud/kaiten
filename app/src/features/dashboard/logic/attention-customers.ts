import type { TFunction } from 'i18next';
import type { BillingHealth, DashboardSummary } from '@/api-client';
import {
  type AttentionLine,
  billingStatusLabel,
  instanceEntitlementsPath,
  instancePath,
  meterMax,
  pushMore,
  pushNotHealthy,
  TOP,
  whenDays,
} from './attention-shared';
import { formatQuantity, percentOf } from './format';

/**
 * The attention lines of the Customers view: one plain sentence per customer
 * situation, the lever beside it. The first few of each check are spelled out;
 * the rest is one line with the count.
 */
export function buildCustomersAttention(
  summary: DashboardSummary,
  t: TFunction,
  locale: string,
  health?: BillingHealth | null,
): AttentionLine[] {
  const lines: AttentionLine[] = [];
  const a = summary.attention;

  a.limitsReached.items.slice(0, TOP).forEach((meter) => {
    lines.push({
      id: `limit-${meter.instanceSlug}-${meter.entitlementSlug}`,
      tone: 'destructive',
      count: 1,
      title: t('Pages.Dashboard.attention.lines.limitReached.title', {
        customer: meter.customerName,
        entitlement: meter.entitlementName,
        license: meter.licenseName,
      }),
      detail: meter.hardLimit
        ? t('Pages.Dashboard.attention.lines.limitReached.detailHard', {
            used: formatQuantity(meter.used),
            max: meterMax(meter),
            instance: meter.instanceName,
          })
        : t('Pages.Dashboard.attention.lines.limitReached.detailSoft', {
            used: formatQuantity(meter.used),
            max: meterMax(meter),
            allowance: meter.allowancePercent,
            instance: meter.instanceName,
          }),
      action: {
        label: t('Pages.Dashboard.attention.lines.limitReached.action'),
        to: instanceEntitlementsPath(meter.instanceSlug),
      },
    });
  });
  pushMore(
    lines,
    'limit-more',
    'destructive',
    a.limitsReached.count - TOP,
    t,
    '/customers/instances',
  );

  if (health) {
    const billingLines: Array<[string, number]> = [
      ['pastDue', health.pastDueSubscriptions],
      ['overdue', health.overdueInvoices],
      ['held', health.heldInvoices.count],
      ['pushFailures', health.pushFailures.count],
    ];
    billingLines.forEach(([key, count]) => {
      if (count > 0) {
        lines.push({
          id: `billing-${key}`,
          tone: key === 'held' ? 'warning' : 'destructive',
          count,
          title: t(`Pages.Dashboard.attention.lines.billing.${key}`, { count }),
          detail: t('Pages.Dashboard.attention.lines.billing.detail'),
          action: {
            label: t('Pages.Dashboard.attention.lines.billing.action'),
            to: '/invoices',
          },
        });
      }
    });
  }

  a.archivedVersions.items.slice(0, TOP).forEach((item) => {
    lines.push({
      id: `archived-${item.instanceSlug}`,
      tone: 'warning',
      count: 1,
      title: t('Pages.Dashboard.attention.lines.archived.title', {
        customer: item.customerName,
        license: item.licenseName,
      }),
      detail: t('Pages.Dashboard.attention.lines.archived.detail', {
        version: item.version,
        default: item.defaultLicenseName
          ? t('Pages.Dashboard.attention.lines.archived.defaultIs', {
              name: item.defaultLicenseName,
            })
          : t('Pages.Dashboard.attention.lines.archived.noDefault'),
        instance: item.instanceName,
      }),
      action: {
        label: t('Pages.Dashboard.attention.lines.archived.action'),
        to: instancePath(item.instanceSlug),
      },
    });
  });
  pushMore(
    lines,
    'archived-more',
    'warning',
    a.archivedVersions.count - TOP,
    t,
    '/customers/instances',
  );

  a.licensesEnding30d.items.slice(0, TOP).forEach((item) => {
    lines.push({
      id: `ending-${item.instanceSlug}`,
      tone: 'warning',
      count: 1,
      title: t('Pages.Dashboard.attention.lines.licenseEnding.title', {
        customer: item.customerName,
        when: whenDays(item.endsAt, t),
      }),
      detail: t('Pages.Dashboard.attention.lines.licenseEnding.detail', {
        license: item.licenseName,
        instance: item.instanceName,
        billing: billingStatusLabel(
          t,
          item.billingStatus,
          item.cancelAtPeriodEnd,
        ),
      }),
      action: {
        label: t('Pages.Dashboard.attention.lines.licenseEnding.action'),
        to: instancePath(item.instanceSlug),
      },
    });
  });
  pushMore(
    lines,
    'ending-more',
    'warning',
    a.licensesEnding30d.count - TOP,
    t,
    '/customers/instances',
  );

  a.nearThreshold.items.slice(0, TOP).forEach((meter) => {
    lines.push({
      id: `near-${meter.instanceSlug}-${meter.entitlementSlug}`,
      tone: 'info',
      count: 1,
      title: t('Pages.Dashboard.attention.lines.nearThreshold.title', {
        customer: meter.customerName,
        entitlement: meter.entitlementName,
      }),
      detail: t('Pages.Dashboard.attention.lines.nearThreshold.detail', {
        used: formatQuantity(meter.used),
        max: meterMax(meter),
        percent: percentOf(meter.ratio) ?? 0,
        license: meter.licenseName,
        instance: meter.instanceName,
      }),
      action: {
        label: t('Pages.Dashboard.attention.lines.nearThreshold.action'),
        to: instanceEntitlementsPath(meter.instanceSlug),
      },
    });
  });
  pushMore(
    lines,
    'near-more',
    'info',
    a.nearThreshold.count - TOP,
    t,
    '/customers/instances',
  );

  a.silentInstances.items.slice(0, TOP).forEach((item) => {
    lines.push({
      id: `silent-${item.instanceSlug}`,
      tone: 'muted',
      count: 1,
      title: t('Pages.Dashboard.attention.lines.silent.title', {
        customer: item.customerName,
        instance: item.instanceName,
      }),
      detail: t('Pages.Dashboard.attention.lines.silent.detail', {
        days: summary.range.days,
      }),
      action: {
        label: t('Pages.Dashboard.attention.lines.silent.action'),
        to: instancePath(item.instanceSlug),
      },
    });
  });
  pushMore(
    lines,
    'silent-more',
    'muted',
    a.silentInstances.count - TOP,
    t,
    '/customers/instances',
  );

  pushNotHealthy(lines, summary, t);
  void locale;
  return lines;
}

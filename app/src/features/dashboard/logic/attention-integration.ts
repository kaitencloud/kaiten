import type { TFunction } from 'i18next';
import type { DashboardSummary } from '@/api-client';
import { formatDate } from '@/lib/format-date';
import {
  type AttentionLine,
  meterLabel,
  pushNotHealthy,
} from './attention-shared';
import { listNames } from './format';

/**
 * The attention lines of the Integration view: one line per check, with the
 * identifiers a developer looks for.
 */
export function buildIntegrationAttention(
  summary: DashboardSummary,
  t: TFunction,
  locale: string,
): AttentionLine[] {
  const lines: AttentionLine[] = [];
  const a = summary.attention;

  if (a.rejectedReports24h.count > 0) {
    lines.push({
      id: 'rejected',
      tone: 'destructive',
      count: a.rejectedReports24h.count,
      title: t('Pages.Dashboard.attention.lines.rejectedReports.title', {
        count: a.rejectedReports24h.count,
      }),
      detail: listNames(
        a.rejectedReports24h.items.map(
          (item) => `${item.instanceSlug} (${item.rejected24h})`,
        ),
        locale,
      ),
      action: {
        label: t('Pages.Dashboard.attention.lines.rejectedReports.action'),
        to: '/audit-trail',
      },
    });
  }
  if (a.limitsReached.count > 0) {
    lines.push({
      id: 'limits',
      tone: 'destructive',
      count: a.limitsReached.count,
      title: t('Pages.Dashboard.attention.lines.limitsReached.title', {
        count: a.limitsReached.count,
      }),
      detail: listNames(a.limitsReached.items.map(meterLabel), locale),
      action: {
        label: t('Pages.Dashboard.attention.lines.limitsReached.action'),
        to: '/customers/instances',
      },
    });
  }
  if (a.silentInstances.count > 0) {
    lines.push({
      id: 'silent',
      tone: 'warning',
      count: a.silentInstances.count,
      title: t('Pages.Dashboard.attention.lines.silents.title', {
        count: a.silentInstances.count,
      }),
      detail: listNames(
        a.silentInstances.items.map((item) => item.instanceSlug),
        locale,
      ),
      action: {
        label: t('Pages.Dashboard.attention.lines.silents.action'),
        to: '/customers/instances',
      },
    });
  }
  a.zonesBehind.items.forEach((zone) => {
    lines.push({
      id: `zone-${zone.slug}`,
      tone: 'warning',
      count: zone.releasesBehind,
      title: t('Pages.Dashboard.attention.lines.zoneBehind.title', {
        zone: zone.name,
        count: zone.releasesBehind,
      }),
      detail: t('Pages.Dashboard.attention.lines.zoneBehind.detail', {
        release: zone.releaseVersion ?? '—',
        instances: zone.instances,
      }),
      action: {
        label: t('Pages.Dashboard.attention.lines.zoneBehind.action'),
        to: '/releases',
      },
    });
  });
  a.tokensExpiring30d.items.forEach((token) => {
    lines.push({
      id: `token-${token.slug}`,
      tone: 'muted',
      count: 1,
      title: t('Pages.Dashboard.attention.lines.tokenExpiring.title', {
        name: token.name,
        when: formatDate(token.expiresAt),
      }),
      detail: t('Pages.Dashboard.attention.lines.tokenExpiring.detail', {
        account: token.serviceAccountName,
      }),
      action: {
        label: t('Pages.Dashboard.attention.lines.tokenExpiring.action'),
        to: '/integrations/service-accounts',
      },
    });
  });
  if (a.nearThreshold.count > 0) {
    lines.push({
      id: 'near',
      tone: 'info',
      count: a.nearThreshold.count,
      title: t('Pages.Dashboard.attention.lines.nearThresholds.title', {
        count: a.nearThreshold.count,
      }),
      detail: listNames(a.nearThreshold.items.map(meterLabel), locale),
      action: {
        label: t('Pages.Dashboard.attention.lines.nearThresholds.action'),
        to: '/customers/instances',
      },
    });
  }
  pushNotHealthy(lines, summary, t);
  return lines;
}

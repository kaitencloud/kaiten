import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { DashboardSummary } from '@/api-client';
import { activityCutDays } from '../activity';
import { buildCustomersAttention } from '../attention';

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction;

const empty = { count: 0, items: [] };

function summaryWith(days: number, activityDays: number): DashboardSummary {
  return {
    range: {
      range: '30d',
      from: '2026-10-12T10:00:00Z',
      to: '2026-11-11T10:00:00Z',
      days,
      activityFrom: '2026-11-04T10:00:00Z',
      activityDays,
    },
    licenses: { ending: { items: [] } },
    attention: {
      limitsReached: empty,
      nearThreshold: empty,
      rejectedReports24h: empty,
      silentInstances: {
        count: 1,
        items: [
          {
            instanceSlug: 'sakura-tokyo-demo',
            instanceName: 'Sakura Tokyo Sales Demo',
            customerSlug: 'sakura-tokyo',
            customerName: 'Sakura Tokyo',
          },
        ],
      },
      instancesNotHealthy: empty,
      licensesEnding30d: empty,
      archivedVersions: empty,
      tokensExpiring30d: empty,
      zonesBehind: empty,
      checked: [],
    },
  } as unknown as DashboardSummary;
}

describe('the activity window', () => {
  it('is cut when the activity covers fewer days than the period', () => {
    expect(activityCutDays(summaryWith(30, 7))).toBe(7);
  });

  it('is not cut when the activity covers the whole period', () => {
    expect(activityCutDays(summaryWith(30, 30))).toBeNull();
  });

  it('gives the silent line the days the activity covers', () => {
    const lines = buildCustomersAttention(summaryWith(30, 7), t, 'en');
    const silent = lines.find((line) => line.id === 'silent-sakura-tokyo-demo');

    expect(silent?.detail).toBe(
      'Pages.Dashboard.attention.lines.silent.detail {"days":7}',
    );
  });
});

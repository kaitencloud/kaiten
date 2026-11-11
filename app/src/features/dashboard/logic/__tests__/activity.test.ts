import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { DashboardSummary } from '@/api-client';
import {
  activeDefinition,
  activityWindows,
  retentionCutLines,
  silenceDetail,
  windowPhrase,
} from '../activity';
import { buildCustomersAttention } from '../attention';

/** Echoes the key, and the options it was given, so a test reads both. */
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction;

const empty = { count: 0, items: [] };

function summaryWith(
  usageHistoryDays: number,
  auditTrailDays: number,
): DashboardSummary {
  return {
    range: {
      range: '30d',
      from: '2026-10-12T10:00:00Z',
      to: '2026-11-11T10:00:00Z',
      days: 30,
      usageHistoryFrom: '2026-10-13T00:00:00Z',
      usageHistoryDays,
      auditTrailFrom: '2026-11-05T00:00:00Z',
      auditTrailDays,
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

describe('the activity windows', () => {
  it('reads each record over its own days, and both over the shorter', () => {
    expect(activityWindows(summaryWith(30, 7))).toEqual({
      period: 30,
      usageHistory: 30,
      auditTrail: 7,
      both: 7,
    });
  });

  it('says "over the period" for the whole period, and counts the days otherwise', () => {
    expect(windowPhrase(t, 30, 30)).toBe('Pages.Dashboard.window.period');
    expect(windowPhrase(t, 1, 30)).toBe(
      'Pages.Dashboard.window.lastDays {"count":1}',
    );
  });

  it('notes each record a retention cuts, and nothing when none does', () => {
    expect(retentionCutLines(t, activityWindows(summaryWith(30, 30)))).toEqual(
      [],
    );
    expect(retentionCutLines(t, activityWindows(summaryWith(30, 7)))).toEqual([
      'Pages.Dashboard.range.cut.auditTrail {"count":7}',
    ]);
    expect(retentionCutLines(t, activityWindows(summaryWith(14, 7)))).toEqual([
      'Pages.Dashboard.range.cut.usageHistory {"count":14}',
      'Pages.Dashboard.range.cut.auditTrail {"count":7}',
    ]);
  });

  it('says what a silent instance did not do over one window, or over each', () => {
    expect(silenceDetail(t, activityWindows(summaryWith(30, 30)))).toBe(
      'Pages.Dashboard.silence.same {"window":"Pages.Dashboard.window.period"}',
    );
    expect(silenceDetail(t, activityWindows(summaryWith(30, 7)))).toBe(
      'Pages.Dashboard.silence.split {"reports":"Pages.Dashboard.window.period","reads":"Pages.Dashboard.window.lastDays {\\"count\\":7}"}',
    );
    expect(activeDefinition(t, activityWindows(summaryWith(30, 7)))).toContain(
      'Pages.Dashboard.figures.activeDefinitionSplit',
    );
  });

  it('dates the silent line from the days both records cover', () => {
    const lines = buildCustomersAttention(summaryWith(30, 1), t, 'en');
    const silent = lines.find((line) => line.id === 'silent-sakura-tokyo-demo');

    expect(silent?.title).toContain(
      '"window":"Pages.Dashboard.window.lastDays {\\"count\\":1}"',
    );
    expect(silent?.detail).toContain('Pages.Dashboard.silence.split');
  });
});

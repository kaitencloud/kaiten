import type { TFunction } from 'i18next';
import type { DashboardSummary } from '@/api-client';

/**
 * How far back each record of activity goes, in calendar days.
 *
 * The API reads the accepted usage reports from the usage history and the
 * refused reports, entitlement reads and flag evaluations from the audit
 * trail, each from its own start (`range.usageHistoryFrom`,
 * `range.auditTrailFrom`): the organization keeps each for its own retention,
 * and one shorter than the period cuts it.
 */
export type ActivityWindows = {
  /** The period's days. */
  period: number;
  /** Days of accepted usage reports. */
  usageHistory: number;
  /** Days of refused reports, entitlement reads and flag evaluations. */
  auditTrail: number;
  /**
   * Days both records cover: what the chart draws, and how long a silent
   * instance has certainly been silent.
   */
  both: number;
};

export function activityWindows(summary: DashboardSummary): ActivityWindows {
  const { days, usageHistoryDays, auditTrailDays } = summary.range;
  return {
    period: days,
    usageHistory: usageHistoryDays,
    auditTrail: auditTrailDays,
    both: Math.min(usageHistoryDays, auditTrailDays),
  };
}

/** "over the period" for the whole period, "over the last N days" for less. */
export function windowPhrase(
  t: TFunction,
  days: number,
  period: number,
): string {
  return days >= period
    ? t('Pages.Dashboard.window.period')
    : t('Pages.Dashboard.window.lastDays', { count: days });
}

/**
 * What a silent instance did not do: over one window when both records cover
 * the same days, over each record's own otherwise.
 */
export function silenceDetail(t: TFunction, w: ActivityWindows): string {
  if (w.usageHistory === w.auditTrail) {
    return t('Pages.Dashboard.silence.same', {
      window: windowPhrase(t, w.both, w.period),
    });
  }
  return t('Pages.Dashboard.silence.split', {
    reports: windowPhrase(t, w.usageHistory, w.period),
    reads: windowPhrase(t, w.auditTrail, w.period),
  });
}

/** What counts as an active instance, over the windows the records cover. */
export function activeDefinition(t: TFunction, w: ActivityWindows): string {
  if (w.usageHistory === w.auditTrail) {
    return t('Pages.Dashboard.figures.activeDefinition', {
      window: windowPhrase(t, w.both, w.period),
    });
  }
  return t('Pages.Dashboard.figures.activeDefinitionSplit', {
    reports: windowPhrase(t, w.usageHistory, w.period),
    reads: windowPhrase(t, w.auditTrail, w.period),
  });
}

/**
 * The lines the page shows under its tabs when a retention cuts the period:
 * one per record it cuts, none when both cover the whole period.
 */
export function retentionCutLines(t: TFunction, w: ActivityWindows): string[] {
  const lines: string[] = [];
  if (w.usageHistory < w.period) {
    lines.push(
      t('Pages.Dashboard.range.cut.usageHistory', { count: w.usageHistory }),
    );
  }
  if (w.auditTrail < w.period) {
    lines.push(
      t('Pages.Dashboard.range.cut.auditTrail', { count: w.auditTrail }),
    );
  }
  return lines;
}

import type { DashboardSummary } from '@/api-client';
import { firstDay } from './dashboard-summary';

/**
 * How many days of each record the organization keeps. Absent: the whole
 * period, whatever it is.
 */
export type DashboardRetention = {
  usageHistoryDays?: number;
  auditTrailDays?: number;
};

export type SerializedDashboardAppModel = {
  summary: DashboardSummary;
  retention?: DashboardRetention;
  readError?: number;
};

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;

/**
 * What `GET /dashboard/summary` answers: one summary, whatever the period asked,
 * or a refusal. The period is the API's concern; the mocks keep one answer so a
 * spec reads the same figures on every tab.
 *
 * A retention is the exception, because the API's answer depends on it: each
 * record is read over the days the organization keeps of it, at most the
 * period's, and the chart and its totals over the days both records cover.
 */
export class DashboardAppModel {
  private readonly summary: DashboardSummary;
  private readonly retention: DashboardRetention;
  private readError?: number;

  constructor(summary: DashboardSummary, retention: DashboardRetention = {}) {
    this.summary = summary;
    this.retention = retention;
  }

  setReadError(status: number) {
    this.readError = status;
  }

  static fromSerialized(state: SerializedDashboardAppModel) {
    const model = new DashboardAppModel(state.summary, state.retention);
    model.readError = state.readError;
    return model;
  }

  serializeForMsw(): SerializedDashboardAppModel {
    return {
      summary: this.summary,
      retention: this.retention,
      readError: this.readError,
    };
  }

  getSummary(range?: string): DashboardSummary {
    if (this.readError) {
      throw Object.assign(new Error('Dashboard unavailable'), {
        httpStatus: this.readError,
      });
    }
    const asked =
      range === '7d' || range === '30d' || range === '90d'
        ? range
        : this.summary.range.range;
    const days = RANGE_DAYS[asked];
    const { usageHistoryDays, auditTrailDays } = this.retention;
    if (usageHistoryDays === undefined && auditTrailDays === undefined) {
      return {
        ...this.summary,
        range: {
          ...this.summary.range,
          range: asked,
          days,
          usageHistoryDays: days,
          auditTrailDays: days,
        },
      };
    }
    const now = new Date(this.summary.range.to);
    const usage = Math.min(usageHistoryDays ?? days, days);
    const audit = Math.min(auditTrailDays ?? days, days);
    const perDay = this.summary.usageReports.perDay.slice(
      -Math.min(usage, audit),
    );
    return {
      ...this.summary,
      range: {
        ...this.summary.range,
        range: asked,
        days,
        usageHistoryFrom: firstDay(now, usage),
        usageHistoryDays: usage,
        auditTrailFrom: firstDay(now, audit),
        auditTrailDays: audit,
      },
      usageReports: { ...this.summary.usageReports, perDay },
      figures: {
        ...this.summary.figures,
        usageReports: {
          ...this.summary.figures.usageReports,
          accepted: perDay.reduce((sum, day) => sum + day.accepted, 0),
          rejected: perDay.reduce((sum, day) => sum + day.rejected, 0),
        },
      },
    };
  }
}

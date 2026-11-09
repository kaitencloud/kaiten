import type { DashboardSummary } from '@/api-client';

export type SerializedDashboardAppModel = {
  summary: DashboardSummary;
  readError?: number;
};

/**
 * What `GET /dashboard/summary` answers: one summary, whatever the period asked,
 * or a refusal. The period is the API's concern; the mocks keep one answer so a
 * spec reads the same figures on every tab.
 */
export class DashboardAppModel {
  private readonly summary: DashboardSummary;
  private readError?: number;

  constructor(summary: DashboardSummary) {
    this.summary = summary;
  }

  setReadError(status: number) {
    this.readError = status;
  }

  static fromSerialized(state: SerializedDashboardAppModel) {
    const model = new DashboardAppModel(state.summary);
    model.readError = state.readError;
    return model;
  }

  serializeForMsw(): SerializedDashboardAppModel {
    return { summary: this.summary, readError: this.readError };
  }

  getSummary(range?: string): DashboardSummary {
    if (this.readError) {
      throw Object.assign(new Error('Dashboard unavailable'), {
        httpStatus: this.readError,
      });
    }
    if (range === '7d' || range === '30d' || range === '90d') {
      return { ...this.summary, range: { ...this.summary.range, range } };
    }
    return this.summary;
  }
}

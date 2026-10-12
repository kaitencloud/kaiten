import type { SyncReport } from '@/api-client';

/**
 * How a pass of the payment providers went, from the report the API answers with
 * (one outcome for each provider it ran):
 * - `done`: every provider was read and applied, and `applied` invoices changed;
 * - `partial`: some invoices could not be read or applied, or one provider failed
 *   and another did not;
 * - `failed`: no provider could be read.
 * `error` is the API's own words for the first thing that went wrong.
 */
export type SyncSummary =
  | { applied: number; kind: 'done' }
  | { applied: number; error?: string; kind: 'partial' }
  | { error?: string; kind: 'failed' };

export function summarizeSyncReport(report: SyncReport): SyncSummary {
  const outcomes = report.providers;
  // A count of invoices, not an amount: nothing money-shaped is added up here.
  let applied = 0;
  for (const outcome of outcomes) {
    applied += outcome.applied;
  }
  const error = outcomes.find((outcome) => outcome.error)?.error;

  if (outcomes.every((outcome) => outcome.status === 'SUCCESS')) {
    return { applied, kind: 'done' };
  }
  if (outcomes.every((outcome) => outcome.status === 'FAILED')) {
    return { error, kind: 'failed' };
  }

  return { applied, error, kind: 'partial' };
}

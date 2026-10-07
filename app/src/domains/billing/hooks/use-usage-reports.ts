import type {
  InfiniteData,
  UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import type { UsageReport } from '@/api-client';
import {
  type BillingProblem,
  getLimitChangeSeqs,
  handleBillingProblem,
} from '../logic';

/**
 * The usage reports a paged read has brought so far, with what the screen reads off
 * them: the reports where the limit in force moved, and whether the period reaches
 * before what the organization keeps.
 *
 * A period that does is an answer, not a failure: it is told apart, with where the
 * kept usage begins, so that the screen can say so and offer to start from there.
 * Only a refusal with nothing read is that answer; one that comes with reports
 * already read is the next page's, which the screen shows under them.
 */
export function useUsageReports<TPage extends { items: UsageReport[] }>(
  query: UseInfiniteQueryResult<InfiniteData<TPage>>,
): {
  limitChanges: ReadonlySet<number>;
  outsideRetention: BillingProblem | null;
  reports: UsageReport[];
} {
  const reports = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const limitChanges = useMemo(() => getLimitChangeSeqs(reports), [reports]);
  const problem =
    query.isError && !query.data ? handleBillingProblem(query.error) : null;

  return {
    limitChanges,
    outsideRetention: problem?.kind === 'outside-retention' ? problem : null,
    reports,
  };
}

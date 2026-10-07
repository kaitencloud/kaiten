import { useTranslation } from 'react-i18next';
import type { UsageReport } from '@/api-client';
import {
  ListEmptyState,
  LoadMoreFooter,
  PagedListSkeleton,
  RetryableProblem,
  useUsageReportColumns,
} from '@/domains/billing';
import { DataTable } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { useUsageHistory } from '../../../../../hooks/use-usage-history';
import { UsageHistoryOutsideRetention } from './usage-history-outside-retention';

type UsageHistoryReportsProps = {
  /** What `useUsageHistory` read for the period. */
  history: ReturnType<typeof useUsageHistory>;
  /** Starts the period where the kept usage begins. */
  onStartFrom: (from: string) => void;
};

const getReportId = (report: UsageReport) => String(report.reportSeq);

/**
 * The reports of the period, as the states around them: reading, refused with a
 * way to ask again, kept no more, none, and some with more to read. "Load more"
 * asks for the reports after the last one read, and those already shown stay where
 * they are. The rows where the limit in force moved are marked.
 */
export function UsageHistoryReports({
  history,
  onStartFrom,
}: UsageHistoryReportsProps) {
  const { t } = useTranslation();
  const { limitChanges, outsideRetention, query, reports } = history;
  const columns = useUsageReportColumns({ limitChanges, showValue: true });
  const Icon = dataModelIcons.entitlement;

  if (query.isPending) {
    return (
      <PagedListSkeleton
        label={t(
          'Pages.Customers.Instances.Detail.entitlements.history.loading',
        )}
        rowClassName="h-10"
        rows={6}
      />
    );
  }
  if (outsideRetention) {
    return (
      <UsageHistoryOutsideRetention
        onStartFrom={onStartFrom}
        problem={outsideRetention}
      />
    );
  }
  if (query.isError && !query.data) {
    return (
      <RetryableProblem
        data-testid="usage-history-error"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (reports.length === 0) {
    return (
      <ListEmptyState
        className="gap-1 py-10"
        description={t(
          'Pages.Customers.Instances.Detail.entitlements.history.Empty.description',
        )}
        icon={Icon}
        testId="usage-history-empty"
        title={t(
          'Pages.Customers.Instances.Detail.entitlements.history.Empty.title',
        )}
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="usage-history-reports">
      <div className="overflow-hidden rounded-lg border">
        <DataTable
          columns={columns}
          data={reports}
          getRowClassName={(report) =>
            limitChanges.has(report.reportSeq) ? 'bg-muted/60' : undefined
          }
          getRowId={getReportId}
          pagination={false}
          variant="simple"
        />
      </div>
      <LoadMoreFooter
        countLabel={t(
          'Pages.Customers.Instances.Detail.entitlements.history.shown',
          { count: reports.length },
        )}
        countTestId="usage-history-count"
        loadMoreLabel={t(
          'Pages.Customers.Instances.Detail.entitlements.history.loadMore',
        )}
        query={query}
      />
    </div>
  );
}

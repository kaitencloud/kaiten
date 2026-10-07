import { useTranslation } from 'react-i18next';
import type { InvoiceLine } from '@/api-client';
import {
  LineFingerprint,
  ListEmptyState,
  LoadMoreFooter,
  PagedListSkeleton,
  RetryableProblem,
} from '@/domains/billing';
import type { useLineReports } from '../../hooks';
import type { UsageWindow } from '../../utils/usage-windows';
import { OutsideRetentionNotice } from './outside-retention-notice';
import { UsageWindowCard } from './usage-window-card';

type LineReportsSectionProps = {
  line: InvoiceLine;
  /** What `useLineReports` read for the line. */
  reports: ReturnType<typeof useLineReports>;
};

/**
 * The reports a metered line was measured from, one card to a reset window, and
 * the states around them: reading, refused, kept no more (the fingerprint
 * instead), none, and some with more to read. "Load more" asks for the reports
 * after the last one read, and the windows already shown stay where they are; the
 * sum of the window the next page continues is left out until it is whole.
 */
export function LineReportsSection({ line, reports }: LineReportsSectionProps) {
  const { t } = useTranslation();
  const { isOutsideRetention, limitChanges, query, reportCount, windows } =
    reports;

  if (query.isPending) {
    return (
      <PagedListSkeleton
        label={t('Pages.Billing.Invoices.Drilldown.loading')}
        rowClassName="h-10"
        rows={6}
      />
    );
  }
  if (isOutsideRetention) {
    return (
      <OutsideRetentionNotice
        error={query.error}
        ledger={line.metering?.ledger}
      />
    );
  }
  if (query.isError && !query.data) {
    return (
      <RetryableProblem
        data-testid="line-reports-error"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (windows.length === 0) {
    return (
      <ListEmptyState
        className="gap-1 py-10"
        description={t('Pages.Billing.Invoices.Drilldown.Empty.description')}
        testId="line-reports-empty"
        title={t('Pages.Billing.Invoices.Drilldown.Empty.title')}
      >
        {line.metering?.ledger ? (
          <LineFingerprint ledger={line.metering.ledger} />
        ) : null}
      </ListEmptyState>
    );
  }

  // The last window is the one the next page may continue: its sum waits for it.
  function renderWindow(window: UsageWindow, index: number) {
    return (
      <UsageWindowCard
        isPartial={query.hasNextPage && index === windows.length - 1}
        key={window.key}
        limitChanges={limitChanges}
        measuresOverage={line.type === 'OVERAGE'}
        window={window}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="line-reports">
      {windows.map(renderWindow)}
      <LoadMoreFooter
        countLabel={t('Pages.Billing.Invoices.Drilldown.shown', {
          count: reportCount,
        })}
        countTestId="line-reports-count"
        loadMoreLabel={t('Pages.Billing.Invoices.Drilldown.loadMore')}
        query={query}
      />
    </div>
  );
}

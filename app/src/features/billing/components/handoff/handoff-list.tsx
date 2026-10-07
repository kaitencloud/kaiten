import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QueuedInvoice } from '@/api-client';
import { RetryableProblem, useCanPerform } from '@/domains/billing';
import { handoffQueryOptions } from '../../queries';
import type { HandoffQueueStatus } from '../../schemas/handoff-search.schema';
import { LoadMoreFooter, PagedListSkeleton } from '../paged-list';
import { AcknowledgeHandoffDialog } from './acknowledge-handoff-dialog';
import { HandoffEmpty } from './handoff-empty';
import { HandoffTable } from './handoff-table';

type HandoffListProps = {
  status: HandoffQueueStatus;
};

/**
 * The invoices of the queue in one status, a page at a time, oldest first. The
 * first page is the one the route warmed; "Load more" reads the next, and the rows
 * already read stay. A person who may acknowledge gets the button on what waits,
 * and the dialog it opens; once the API has accepted it, the queue is read again
 * and the invoice moves to the other status.
 */
export function HandoffList({ status }: HandoffListProps) {
  const { t } = useTranslation();
  const query = useInfiniteQuery(handoffQueryOptions(status));
  const canAcknowledge = useCanPerform('handoff.acknowledge');
  const [target, setTarget] = useState<QueuedInvoice | null>(null);
  const invoices = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  if (query.isPending) {
    return (
      <PagedListSkeleton
        className="mt-4"
        label={t('Pages.Billing.Handoff.loading')}
        rows={6}
      />
    );
  }
  if (query.isError && !query.data) {
    return (
      <RetryableProblem
        className="mt-4"
        data-testid="handoff-error"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (invoices.length === 0) {
    return <HandoffEmpty status={status} />;
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1">
        <HandoffTable
          bodyScrollable
          invoices={invoices}
          onAcknowledge={canAcknowledge ? setTarget : undefined}
          status={status}
        />
      </div>
      <LoadMoreFooter
        className="pb-1"
        countLabel={t('Pages.Billing.Handoff.shown', {
          count: invoices.length,
        })}
        countTestId="handoff-count"
        loadMoreLabel={t('Pages.Billing.Handoff.loadMore')}
        query={query}
      />
      {target ? (
        <AcknowledgeHandoffDialog
          invoice={target}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </div>
  );
}

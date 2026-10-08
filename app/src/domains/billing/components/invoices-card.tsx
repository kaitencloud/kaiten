import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageInvoiceSummary } from '@/api-client';
import { TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { InvoicesTable, type InvoicesTableColumn } from './invoices-table';
import { ListEmptyState, PagedListSkeleton } from './paged-list';
import { RetryableProblem } from './retryable-problem';

/** What the card reads of the query its page brings. */
type InvoicesQueryResult = Pick<
  UseQueryResult<PageInvoiceSummary, unknown>,
  'data' | 'error' | 'isError' | 'isPending' | 'refetch'
>;

type InvoicesCardProps = {
  /** What the card says it lists: "The invoices of this instance's subscription." */
  description: string;
  /** What to say when there is no invoice yet, which tells why for the screen it is on. */
  emptyDescription: string;
  /** The columns the page already says: the same array from one render to the next. */
  hiddenColumns: readonly InvoicesTableColumn[];
  /** A prefix for the test ids of the card, so that two lists on a page stay apart. */
  testIdPrefix: string;
  /** The invoices, every page of them, read by the page that shows them. */
  query: InvoicesQueryResult;
};

/**
 * The invoices of one subject, instance or customer, in a card of its page: the
 * same table as the organization's list, sorted and paged in the browser since
 * the card holds them all. The page brings the query, so that it decides what it
 * lists and what refreshes it; the card draws its four states, loading, refused
 * with a way to ask again, empty and populated, and never adds anything up.
 */
export function InvoicesCard({
  description,
  emptyDescription,
  hiddenColumns,
  query,
  testIdPrefix,
}: InvoicesCardProps) {
  const { t } = useTranslation();
  const Icon = dataModelIcons.invoice;
  const invoices = query.data?.items ?? [];

  // The states that are not the table sit inside the card's own gutter and end
  // with its own space: the card owns them, and none of them pads itself for it.
  function renderState(state: ReactNode) {
    return <div className="px-6 pb-6">{state}</div>;
  }

  function renderBody() {
    if (query.isPending) {
      return renderState(
        <PagedListSkeleton
          label={t('Features.Billing.InvoicesCard.loading')}
          rowClassName="h-12"
          rows={3}
        />,
      );
    }
    if (query.isError && !query.data) {
      return renderState(
        <RetryableProblem
          data-testid={`${testIdPrefix}-error`}
          error={query.error}
          onRetry={() => void query.refetch()}
        />,
      );
    }
    if (invoices.length === 0) {
      return renderState(
        <ListEmptyState
          className="py-10"
          description={emptyDescription}
          icon={Icon}
          testId={`${testIdPrefix}-empty`}
          title={t('Features.Billing.InvoicesCard.emptyTitle')}
        />,
      );
    }

    return (
      <InvoicesTable
        hiddenColumns={hiddenColumns}
        invoices={invoices}
        variant="simple"
      />
    );
  }

  return (
    <TableCard>
      <TableCard.Header>
        <TableCard.HeaderLeading>
          <TableCard.HeaderIcon>
            <Icon />
          </TableCard.HeaderIcon>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle>
              {t('Features.Billing.InvoicesCard.title')}
            </TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>{description}</TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>
      </TableCard.Header>
      <TableCard.Content>{renderBody()}</TableCard.Content>
    </TableCard>
  );
}

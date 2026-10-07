import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  type InvoicesTableColumn,
  InvoicesTable,
  ListEmptyState,
  LoadMoreFooter,
  PagedListSkeleton,
  RetryableProblem,
} from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';
import { invoicesQueryOptions } from '../../queries';
import type { InvoiceFilters } from '../../schemas/invoice-filters.schema';
import { hasActiveInvoiceFilters } from '../../utils/invoice-filters';

type InvoicesListProps = {
  filters: InvoiceFilters;
  onClearFilters: () => void;
  /** Whether Stripe collects invoices here: with NoOp alone the provider is not worth a column. */
  showProvider: boolean;
};

// The same array on every render: the table builds its columns from it.
const WITHOUT_PROVIDER: readonly InvoicesTableColumn[] = ['provider'];
const WITH_PROVIDER: readonly InvoicesTableColumn[] = [];

function EmptyInvoices({
  filtered,
  onClearFilters,
}: {
  filtered: boolean;
  onClearFilters: () => void;
}) {
  const { t } = useTranslation();

  return (
    <ListEmptyState
      className="mt-4"
      description={t(
        filtered
          ? 'Pages.Billing.Invoices.Empty.filteredDescription'
          : 'Pages.Billing.Invoices.Empty.description',
      )}
      icon={dataModelIcons.invoice}
      testId="invoices-empty"
      title={t(
        filtered
          ? 'Pages.Billing.Invoices.Empty.filteredTitle'
          : 'Pages.Billing.Invoices.Empty.title',
      )}
    >
      {filtered ? (
        <Button onClick={onClearFilters} size="sm" variant="outline">
          {t('Pages.Billing.Invoices.Filters.clear')}
        </Button>
      ) : (
        <Button
          nativeButton={false}
          role="link"
          render={
            <Link to="/customers/instances">
              {t('Pages.Billing.Invoices.Empty.instances')}
            </Link>
          }
          size="sm"
          variant="outline"
        />
      )}
    </ListEmptyState>
  );
}

/**
 * The invoices the filters select, a page at a time: the loading, error, empty and
 * populated states of the list. The first page is read by the query the route
 * warmed; "Load more" asks for the next one with the same filters, and the rows
 * already read stay where they are. A refusal is shown as the API wrote it, with a
 * way to ask again, and the filters stay: they are in the URL, not here.
 */
export function InvoicesList({
  filters,
  onClearFilters,
  showProvider,
}: InvoicesListProps) {
  const { t } = useTranslation();
  const query = useInfiniteQuery(invoicesQueryOptions(filters));
  const invoices = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  if (query.isPending) {
    return (
      <PagedListSkeleton
        className="mt-4"
        label={t('Pages.Billing.Invoices.loading')}
        rows={8}
      />
    );
  }
  if (query.isError && !query.data) {
    return (
      <RetryableProblem
        className="mt-4"
        data-testid="invoices-error"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (invoices.length === 0) {
    return (
      <EmptyInvoices
        filtered={hasActiveInvoiceFilters(filters)}
        onClearFilters={onClearFilters}
      />
    );
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 flex-1">
        <InvoicesTable
          bodyScrollable
          className="h-full"
          hiddenColumns={showProvider ? WITH_PROVIDER : WITHOUT_PROVIDER}
          invoices={invoices}
        />
      </div>
      <LoadMoreFooter
        className="pb-1"
        countLabel={t('Pages.Billing.Invoices.shown', {
          count: invoices.length,
        })}
        countTestId="invoices-count"
        loadMoreLabel={t('Pages.Billing.Invoices.loadMore')}
        query={query}
      />
    </div>
  );
}

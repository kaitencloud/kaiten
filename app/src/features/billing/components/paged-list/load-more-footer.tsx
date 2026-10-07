import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/domains/billing';
import { cn } from '@/lib/utils';

/** What the footer reads of an infinite query: the next page, and why it could not be read. */
type PagedQuery = {
  error: unknown;
  fetchNextPage: () => unknown;
  hasNextPage: boolean;
  isFetchNextPageError: boolean;
  isFetchingNextPage: boolean;
};

type LoadMoreFooterProps = {
  className?: string;
  /**
   * How many rows were read, in words ("50 invoices shown"). Never how many there
   * are: the API does not say, and a page is not the whole list.
   */
  countLabel: string;
  countTestId: string;
  loadMoreLabel: string;
  query: PagedQuery;
};

/**
 * The foot of a list the server pages: how many rows were read, announced politely
 * as it grows, and the button that reads the next page with the same filters. The
 * rows already read stay where they are; a refusal of the next page is shown above
 * the count, under the rows, and the button stays so that it can be asked again.
 */
export function LoadMoreFooter({
  className,
  countLabel,
  countTestId,
  loadMoreLabel,
  query,
}: LoadMoreFooterProps) {
  return (
    <>
      {query.isFetchNextPageError ? <ProblemAlert error={query.error} /> : null}
      <div className={cn('flex items-center justify-between gap-3', className)}>
        <p
          aria-live="polite"
          className="text-sm text-muted-foreground"
          data-testid={countTestId}
        >
          {countLabel}
        </p>
        {query.hasNextPage ? (
          <Button
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
            type="button"
            variant="outline"
          >
            {query.isFetchingNextPage ? (
              <Loader2 className="animate-spin" />
            ) : null}
            {loadMoreLabel}
          </Button>
        ) : null}
      </div>
    </>
  );
}

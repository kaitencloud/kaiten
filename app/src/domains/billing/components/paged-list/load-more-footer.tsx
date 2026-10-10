import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '../problem-alert';

/** What the footer reads of an infinite query: the next page, and why it could not be read. */
type PagedQuery = {
  error: unknown;
  fetchNextPage: () => unknown;
  hasNextPage: boolean;
  isFetchNextPageError: boolean;
  isFetchingNextPage: boolean;
};

type LoadMoreFooterProps = {
  loadMoreLabel: string;
  query: PagedQuery;
};

/**
 * The foot of a feed the server pages, as the notifications feed draws its own: a
 * centred "Load more" under the rows, while there are more to read, which reads the
 * next page with the same filters. The rows already read stay where they are; a
 * refusal of the next page is shown above the button, under the rows, and the
 * button stays so that it can be asked again. It never says how many rows were
 * read: the API does not say how many there are, and a count of a page reads as one
 * of the list.
 */
export function LoadMoreFooter({ loadMoreLabel, query }: LoadMoreFooterProps) {
  return (
    <>
      {query.isFetchNextPageError ? <ProblemAlert error={query.error} /> : null}
      {query.hasNextPage ? (
        <div className="flex justify-center py-3">
          <Button
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
            size="sm"
            type="button"
            variant="outline"
          >
            {query.isFetchingNextPage ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : null}
            {loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </>
  );
}

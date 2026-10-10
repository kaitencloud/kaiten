import { useRouter } from '@tanstack/react-router';
import { NotFound } from '@/components/route/not-found';
import { handleBillingProblem } from '../logic';
import { RetryableProblem } from './retryable-problem';

type BillingRouteErrorProps = {
  /** What a loader or a component of the route threw. */
  error: unknown;
};

/**
 * The `errorComponent` of a billing route: the API's own words for why it
 * refused (its `detail`, the trace id of a failure that is the server's, a
 * banner that names a missing scope), and a way to ask again. A missing record
 * is a page that does not exist, so it reads as one. It keeps the console around
 * it: nothing but this screen failed, and nothing was changed.
 *
 * Asking again invalidates the router: that runs the loaders of the route once
 * more and resets its error boundaries. The `reset` the router hands an error
 * component only clears the boundary, which throws the same error again, since
 * the route that failed is still the one that failed.
 */
export function BillingRouteError({ error }: BillingRouteErrorProps) {
  const router = useRouter();

  if (handleBillingProblem(error).status === 404) {
    return <NotFound />;
  }

  return (
    <RetryableProblem
      className="mx-auto w-full max-w-2xl p-4 sm:p-6"
      data-testid="billing-route-error"
      error={error}
      onRetry={() => void router.invalidate()}
    />
  );
}

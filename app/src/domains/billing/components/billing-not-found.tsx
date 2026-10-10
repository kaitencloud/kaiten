import { useRouter } from '@tanstack/react-router';
import { NotFound } from '@/components/route/not-found';
import { isClosedBillingGate } from '../logic';
import { BillingUnavailable } from './billing-unavailable';

type BillingNotFoundProps = {
  /** What the guard of the route threw with its not-found: the closed gate. */
  data?: unknown;
};

/**
 * The `notFoundComponent` of a guarded billing route. Where the guard closed the
 * gate (`requireBillingCapability`), it is the explanation of why billing is not
 * here, never an error, and it offers to read the capabilities again when they
 * could not be read, which runs the guard once more. Anything else is a path
 * under the route that is no page, and reads as one.
 */
export function BillingNotFound({ data }: BillingNotFoundProps) {
  const router = useRouter();

  if (!isClosedBillingGate(data)) {
    return <NotFound />;
  }

  return (
    <BillingUnavailable
      onRetry={
        data.reason === 'UNREACHABLE'
          ? () => void router.invalidate()
          : undefined
      }
      reason={data.reason}
      scope={data.scope}
    />
  );
}

import {
  queryOptions,
  type QueryClient,
  useQuery,
} from '@tanstack/react-query';
import { notFound } from '@tanstack/react-router';
import { getBillingCapabilities } from '@/api-client';
import { getBillingCapabilitiesOptions } from '@/api-client/@tanstack/react-query.gen';
import { logger } from '@/lib/logger';
import {
  type BillingAvailability,
  hasBillingFeature,
  resolveBillingAvailability,
  toBillingGate,
} from '../logic/billing-availability';
import type {
  BillingCapabilitiesState,
  BillingFeatureKey,
  BillingGate,
} from '../types';

/** How long the console waits for the capabilities before it gives up on billing. */
export const BILLING_CAPABILITIES_TIMEOUT_MS = 10_000;

/**
 * Asks for the capabilities, and gives up after `BILLING_CAPABILITIES_TIMEOUT_MS`:
 * billing is only shown once it answered, so an API that never does must not
 * leave the navigation waiting. The timer is the app's own rather than
 * `AbortSignal.timeout`, so that tests can drive it.
 *
 * The signal of the query is left alone on purpose. A query whose signal is read
 * is cancelled when its last observer goes away, which React's strict mode does
 * on every mount in development, and the route guard that is waiting on the same
 * read would take that cancellation for a failure and close the gate on an API
 * that was about to answer. The capabilities are cheap and shared: the read
 * finishes, and its answer is cached for whoever asks next.
 */
async function fetchBillingCapabilities() {
  const request = new AbortController();
  const timer = setTimeout(
    () => request.abort(new Error('The billing capabilities timed out')),
    BILLING_CAPABILITIES_TIMEOUT_MS,
  );

  try {
    const { data } = await getBillingCapabilities({
      signal: request.signal,
      throwOnError: true,
    });
    return data;
  } catch (error) {
    logger.warn('Billing capabilities unavailable: billing stays hidden', {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `GET /billing/capabilities`, the single source of whether billing exists
 * here: the navigation, the routes, the tabs and the actions of billing show
 * only when it says `enabled`. It keeps the generated key, so that settings
 * invalidate it as any other read of that operation.
 *
 * A failure is not cached as an answer and not retried: the next read asks
 * again, and meanwhile billing fails closed (`resolveBillingAvailability`).
 */
export const billingCapabilitiesQueryOptions = queryOptions({
  ...getBillingCapabilitiesOptions(),
  queryFn: () => fetchBillingCapabilities(),
  retry: false,
  // The capabilities change with a deployment, not with a click.
  staleTime: 60_000,
});

/**
 * What the shell and the screens read to decide whether billing exists. It
 * loads without suspending: while it does, and whenever it fails, billing is off.
 */
export function useBillingCapabilities(): BillingCapabilitiesState {
  const { data, error, isPending } = useQuery(billingCapabilitiesQueryOptions);
  const availability = resolveBillingAvailability(data, error);

  return {
    capabilities: availability.available
      ? availability.capabilities
      : undefined,
    has: (feature?: BillingFeatureKey) =>
      hasBillingFeature(availability, feature),
    isEnabled: availability.available,
    isPending,
    unavailableReason:
      isPending || availability.available ? undefined : availability.reason,
  };
}

/** What a route guard knows once the capabilities are in, or have failed. */
async function readAvailability(
  queryClient: QueryClient,
): Promise<BillingAvailability> {
  try {
    return resolveBillingAvailability(
      await queryClient.ensureQueryData(billingCapabilitiesQueryOptions),
      undefined,
    );
  } catch (error) {
    return resolveBillingAvailability(undefined, error);
  }
}

/**
 * The gate of a billing route: loads the capabilities (from the cache when they
 * are there) and tells whether the route's screens can render. A `feature` asks
 * for a part of billing this release may not ship (add-ons, vouchers). It never
 * throws: `requireBillingCapability` decides what a closed gate does.
 */
export async function readBillingGate(
  queryClient: QueryClient,
  feature?: BillingFeatureKey,
): Promise<BillingGate> {
  return toBillingGate(await readAvailability(queryClient), feature);
}

/**
 * The guard of a billing route, for its `beforeLoad`: lets the route load when
 * billing is there (and, with a `feature`, when this release ships that part),
 * and otherwise throws `notFound({ data })` with the closed gate, which says why.
 *
 * It throws rather than returns on purpose. A `beforeLoad` that returns lets the
 * `beforeLoad` and the `loader` of every route below it run, which would ask the
 * API for billing where billing is not there; a throw stops them all. The route's
 * own `notFoundComponent`, `BillingNotFound`, then shows the explanation in place
 * of the screen, so a link to a billing page explains instead of failing, and
 * nothing billing-related is requested but the capabilities.
 *
 * ```ts
 * export const Route = createFileRoute('/billing')({
 *   notFoundComponent: BillingNotFound,
 *   beforeLoad: async ({ context }) => {
 *     await requireBillingCapability(context.queryClient);
 *   },
 * });
 * ```
 */
export async function requireBillingCapability(
  queryClient: QueryClient,
  feature?: BillingFeatureKey,
): Promise<void> {
  const gate = await readBillingGate(queryClient, feature);

  if (!gate.available) {
    throw notFound({ data: gate });
  }
}

import type { BillingCapabilities } from '@/api-client';
import type {
  BillingFeatureKey,
  BillingGate,
  BillingUnavailableReason,
  ClosedBillingGate,
} from '../types';
import { getActionScopes } from './billing-actions';
import { handleBillingProblem } from './billing-problem';

/**
 * Billing fails closed. It is on only when `GET /billing/capabilities` answers
 * that it is, and every other outcome hides it, none of them as an error page: a
 * 403 (the caller cannot even read the capabilities), a 404 (an API older than
 * billing), a 503, a timeout, a network failure. What differs is the
 * explanation a deep link to a billing screen shows.
 */

/** The scope reading the capabilities needs, which a 403 names when it can. */
const CAPABILITIES_SCOPE = getActionScopes('capabilities.read')[0];

function reasonOfFailure(error: unknown): {
  reason: BillingUnavailableReason;
  scope?: string;
} {
  const problem = handleBillingProblem(error);

  if (problem.kind === 'missing-scope') {
    return {
      reason: 'MISSING_SCOPE',
      scope: problem.missingScope ?? CAPABILITIES_SCOPE,
    };
  }
  if (problem.kind === 'unavailable') {
    return { reason: problem.unavailableReason ?? 'DEPLOYMENT_DISABLED' };
  }
  // The route does not exist: the API is older than billing.
  if (problem.status === 404) {
    return { reason: 'FEATURE_UNAVAILABLE' };
  }

  return { reason: 'UNREACHABLE' };
}

export type BillingAvailability =
  | { available: true; capabilities: BillingCapabilities }
  | {
      available: false;
      reason: BillingUnavailableReason;
      scope?: string;
    };

/** What the capabilities query settled on: its answer, or its failure. */
export function resolveBillingAvailability(
  capabilities: BillingCapabilities | undefined,
  error: unknown,
): BillingAvailability {
  if (capabilities) {
    return capabilities.enabled
      ? { available: true, capabilities }
      : {
          available: false,
          reason: capabilities.disabledReason ?? 'DEPLOYMENT_DISABLED',
        };
  }

  return { available: false, ...reasonOfFailure(error) };
}

/**
 * Whether `feature` can be offered: billing on, and the release shipping the
 * part. Without a feature, whether billing is on.
 */
export function hasBillingFeature(
  availability: BillingAvailability,
  feature?: BillingFeatureKey,
): boolean {
  if (!availability.available) {
    return false;
  }

  return feature === undefined || availability.capabilities.features[feature];
}

/** The gate a route guard applies: the screens, or the reason for none. */
export function toBillingGate(
  availability: BillingAvailability,
  feature?: BillingFeatureKey,
): BillingGate {
  if (!availability.available) {
    return {
      available: false,
      reason: availability.reason,
      scope: availability.scope,
    };
  }

  return hasBillingFeature(availability, feature)
    ? { available: true }
    : { available: false, reason: 'FEATURE_UNAVAILABLE' };
}

const REASONS: Record<BillingUnavailableReason, true> = {
  DEPLOYMENT_DISABLED: true,
  FEATURE_UNAVAILABLE: true,
  MISSING_SCOPE: true,
  NOT_ENTITLED: true,
  UNREACHABLE: true,
};

/**
 * Whether `value` is a closed gate: what a route guard throws with its
 * not-found, and a `notFoundComponent` receives as its `data`, which is unknown
 * to it. Anything else, such as no data at all, is not.
 */
export function isClosedBillingGate(
  value: unknown,
): value is ClosedBillingGate {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { available, reason } = value as Partial<ClosedBillingGate>;

  return (
    available === false &&
    typeof reason === 'string' &&
    Object.hasOwn(REASONS, reason)
  );
}

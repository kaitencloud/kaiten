import type { BillingCapabilities, BillingFeatures } from '@/api-client';

/** A part of billing a release may or may not ship (`features` of the capabilities). */
export type BillingFeatureKey = keyof BillingFeatures;

/**
 * Why a billing screen is not offered:
 * - `DEPLOYMENT_DISABLED`: billing is off on this deployment;
 * - `NOT_ENTITLED`: the organization's plan does not include it (Cloud);
 * - `MISSING_SCOPE`: the session cannot read the capabilities (the read scope of
 *   billing);
 * - `FEATURE_UNAVAILABLE`: billing is on but this release does not ship the
 *   part asked for, or the API predates billing altogether;
 * - `UNREACHABLE`: the capabilities could not be read (timeout, 5xx). Billing
 *   stays hidden: it fails closed.
 */
export type BillingUnavailableReason =
  | 'DEPLOYMENT_DISABLED'
  | 'NOT_ENTITLED'
  | 'MISSING_SCOPE'
  | 'FEATURE_UNAVAILABLE'
  | 'UNREACHABLE';

/**
 * What a route guard decides: billing screens render, or an explanation does.
 * `scope` names the scope a `MISSING_SCOPE` refusal asked for.
 */
export type BillingGate =
  | { available: true }
  | {
      available: false;
      reason: BillingUnavailableReason;
      scope?: string;
    };

/** A gate that is closed: no billing screen renders, and this says why. */
export type ClosedBillingGate = Extract<BillingGate, { available: false }>;

/** What `useBillingCapabilities` tells the navigation and the screens. */
export type BillingCapabilitiesState = {
  /** The capabilities, once billing answered that it is on. */
  capabilities?: BillingCapabilities;
  /**
   * Whether billing is on and, given a feature, whether this release ships it.
   * False while the capabilities load and whenever they cannot be read.
   */
  has: (feature?: BillingFeatureKey) => boolean;
  /** Billing is on. */
  isEnabled: boolean;
  /** The capabilities are being read: billing stays hidden meanwhile. */
  isPending: boolean;
  /** Why billing is off, once that is known. */
  unavailableReason?: BillingUnavailableReason;
};

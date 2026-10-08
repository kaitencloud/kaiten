import type { BillingCapabilities, BillingFeatures } from '@/api-client';
import { zBillingCapabilities } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';

type Provider = BillingCapabilities['providers'][number];

const NOOP_PROVIDER: Provider = {
  available: true,
  capabilities: {
    automaticCollection: false,
    billingPortal: false,
    paymentMethodCapture: false,
  },
  connected: true,
  kind: 'NOOP',
};

const STRIPE_PROVIDER: Provider = {
  available: true,
  capabilities: {
    automaticCollection: true,
    billingPortal: true,
    paymentMethodCapture: true,
  },
  connected: true,
  kind: 'STRIPE',
};

export const NO_BILLING_FEATURES: BillingFeatures = {
  addons: false,
  chargeAutomatically: false,
  lifecycle: false,
  publicSurface: false,
  stripe: false,
  trials: false,
  vouchers: false,
};

export const ALL_BILLING_FEATURES: BillingFeatures = {
  addons: true,
  chargeAutomatically: true,
  lifecycle: true,
  publicSurface: true,
  stripe: true,
  trials: true,
  vouchers: true,
};

/**
 * `GET /billing/capabilities` as the Core API answers it, validated against the
 * contract. The defaults are what the API serves with billing on and nothing
 * else shipped: NoOp as the only provider, no public surface, no feature.
 */
export function billingCapabilities(
  overrides: Partial<BillingCapabilities> = {},
): BillingCapabilities {
  return parseContract(
    zBillingCapabilities,
    {
      enabled: true,
      features: NO_BILLING_FEATURES,
      providers: [NOOP_PROVIDER],
      publicSurface: { enabled: false },
      usageIdempotencyWindowDays: 35,
      ...overrides,
    },
    'billingCapabilities',
  );
}

/**
 * The capability profiles the mocks serve. Which one a suite picks is a
 * statement about what the console runs against:
 * - `stack`: what the API of the local stack serves for the screens the console
 *   has: billing on with NoOp, and the lifecycle and the trials that release
 *   ships. The API serves the add-ons and the vouchers too, and this profile
 *   leaves them off: the console has no screen for them yet, and the navigation
 *   would list pages that do not exist. It is the profile of `dev:mock`;
 * - `full`: Stripe connected and every part of billing shipped;
 * - `disabled`: billing off, for the reason the API gives. A disabled
 *   deployment still lists NoOp and the idempotency window: only `enabled`,
 *   `disabledReason` and the features say it is off.
 *
 * An API that does not know the route at all (a release older than billing)
 * answers 404 instead of a body: see `BillingAppModel.failCapabilities`.
 */
export const billingCapabilitiesProfiles = {
  disabled: (
    reason: NonNullable<
      BillingCapabilities['disabledReason']
    > = 'DEPLOYMENT_DISABLED',
  ) => billingCapabilities({ disabledReason: reason, enabled: false }),
  full: () =>
    billingCapabilities({
      features: ALL_BILLING_FEATURES,
      providers: [NOOP_PROVIDER, STRIPE_PROVIDER],
      publicSurface: { enabled: true },
      usageHistoryRetentionMonths: 6,
    }),
  // The stack keeps 18 months of usage: what its API answers.
  stack: () =>
    billingCapabilities({
      features: { ...NO_BILLING_FEATURES, lifecycle: true, trials: true },
      usageHistoryRetentionMonths: 18,
    }),
} as const;

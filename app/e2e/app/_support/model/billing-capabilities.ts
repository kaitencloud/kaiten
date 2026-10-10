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

const STRIPE_CAPABILITIES = {
  automaticCollection: true,
  billingPortal: true,
  paymentMethodCapture: true,
} as const;

const STRIPE_PROVIDER: Provider = {
  available: true,
  capabilities: STRIPE_CAPABILITIES,
  connected: true,
  kind: 'STRIPE',
  livemode: false,
};

/**
 * Where Stripe stands for the organization, as the API tells it in `providers`:
 * - `connected`, `connectedLive`: its connector is active, on a test or a live account;
 * - `available`: it can be connected here and is not;
 * - `notEntitled`: the plan of the organization does not include the connector (Cloud);
 * - `vaultMissing`: a self-hosted deployment without the Vault that stores the key.
 */
export type StripeStanding =
  | 'available'
  | 'connected'
  | 'connectedLive'
  | 'notEntitled'
  | 'vaultMissing';

export function stripeProvider(standing: StripeStanding): Provider {
  switch (standing) {
    case 'connected':
      return STRIPE_PROVIDER;
    case 'connectedLive':
      return { ...STRIPE_PROVIDER, livemode: true };
    case 'available':
      return {
        available: true,
        capabilities: STRIPE_CAPABILITIES,
        connected: false,
        kind: 'STRIPE',
      };
    case 'notEntitled':
      return {
        available: false,
        capabilities: STRIPE_CAPABILITIES,
        connected: false,
        kind: 'STRIPE',
        unavailableReason: 'NOT_ENTITLED',
      };
    case 'vaultMissing':
      return {
        available: false,
        capabilities: STRIPE_CAPABILITIES,
        connected: false,
        kind: 'STRIPE',
        unavailableReason: 'VAULT_NOT_CONFIGURED',
      };
  }
}

/**
 * A release that ships nothing of billing's parts, for a test that makes a flag
 * lie on purpose: the console decides from `providers` and the scopes, so what a
 * flag says must not matter. No API answers this today.
 */
export const NO_BILLING_FEATURES: BillingFeatures = {
  addons: false,
  chargeAutomatically: false,
  lifecycle: false,
  publicSurface: false,
  stripe: false,
  trials: false,
  vouchers: false,
};

/**
 * The two parts every release the console talks to ships, whatever else it ships:
 * automatic collection and the public surface. The API answers both `true` (the
 * handler fixes them since `a4f1d916`), so a profile starts from these and turns
 * on the parts it has screens for.
 */
export const SHIPPED_BILLING_FEATURES: BillingFeatures = {
  ...NO_BILLING_FEATURES,
  chargeAutomatically: true,
  publicSurface: true,
};

/**
 * Every part: what the API answers for any organization, billing on or off. The
 * handler fixes the features to what the release ships, and `enabled` is what says
 * whether this organization has billing.
 */
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
 * contract. The defaults are what the API serves with billing on and a release
 * that ships no more than the base: NoOp as the only provider, automatic
 * collection and the public surface shipped (`SHIPPED_BILLING_FEATURES`), and
 * `publicSurface.enabled` equal to `enabled`, as the handler answers it.
 */
export function billingCapabilities(
  overrides: Partial<BillingCapabilities> = {},
): BillingCapabilities {
  const enabled = overrides.enabled ?? true;

  return parseContract(
    zBillingCapabilities,
    {
      disabledReason: null,
      enabled,
      features: SHIPPED_BILLING_FEATURES,
      providers: [NOOP_PROVIDER],
      publicSurface: { enabled },
      usageHistoryRetentionMonths: null,
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
 *   had before the add-ons: billing on with NoOp, and the lifecycle and the trials
 *   that release ships. The API serves the add-ons and the vouchers too, and this
 *   profile leaves them off, so that the many tests that read it keep asking for
 *   what they always did and nothing more;
 * - `stackWithAddons`: the stack and the add-ons, now that the console has their
 *   screens: the navigation lists them, the Billing tab of an instance holds them
 *   and the dialog that subscribes one offers them;
 * - `stackWithVouchers`: the stack, the add-ons and the vouchers, now that the console
 *   has their screens: the navigation lists them, the Billing tab of an instance holds
 *   what it redeemed and the dialog that subscribes one takes a code. It is the profile
 *   of `dev:mock`;
 * - `full`: Stripe connected and every part of billing shipped;
 * - `stackWithStripe`: what the API serves now, Stripe included: every part of the
 *   release the console has screens for, the provider as asked, and the flags as the
 *   API answers them (`stripe`, `chargeAutomatically` and `publicSurface` true,
 *   whether or not the provider can be connected here). It is the profile of
 *   `dev:mock`. A spec that makes a flag lie says so (`NO_BILLING_FEATURES`): the
 *   gates read `providers` and the scopes, not the flags;
 * - `disabled`: billing off, for the reason the API gives. A disabled
 *   deployment still lists NoOp, the idempotency window and the features its
 *   release ships: only `enabled`, `disabledReason` and `publicSurface.enabled`
 *   say it is off.
 *
 * An API that does not know the route at all (a release older than billing)
 * answers 404 instead of a body: see `BillingAppModel.failCapabilities`.
 */
export const billingCapabilitiesProfiles = {
  disabled: (
    reason: NonNullable<
      BillingCapabilities['disabledReason']
    > = 'DEPLOYMENT_DISABLED',
  ) =>
    billingCapabilities({
      disabledReason: reason,
      enabled: false,
      features: ALL_BILLING_FEATURES,
    }),
  full: () =>
    billingCapabilities({
      features: ALL_BILLING_FEATURES,
      providers: [NOOP_PROVIDER, STRIPE_PROVIDER],
      usageHistoryRetentionMonths: 6,
    }),
  // The stack keeps 18 months of usage: what its API answers.
  stack: () =>
    billingCapabilities({
      features: { ...SHIPPED_BILLING_FEATURES, lifecycle: true, trials: true },
      usageHistoryRetentionMonths: 18,
    }),
  stackWithAddons: () =>
    billingCapabilities({
      features: {
        ...SHIPPED_BILLING_FEATURES,
        addons: true,
        lifecycle: true,
        trials: true,
      },
      usageHistoryRetentionMonths: 18,
    }),
  stackWithStripe: (standing: StripeStanding = 'connected') =>
    billingCapabilities({
      features: {
        ...SHIPPED_BILLING_FEATURES,
        addons: true,
        lifecycle: true,
        stripe: true,
        trials: true,
        vouchers: true,
      },
      providers: [NOOP_PROVIDER, stripeProvider(standing)],
      usageHistoryRetentionMonths: 18,
    }),
  stackWithVouchers: () =>
    billingCapabilities({
      features: {
        ...SHIPPED_BILLING_FEATURES,
        addons: true,
        lifecycle: true,
        trials: true,
        vouchers: true,
      },
      usageHistoryRetentionMonths: 18,
    }),
} as const;

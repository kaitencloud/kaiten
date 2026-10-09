import type { BillingCapabilities, BillingProvider } from '@/api-client';

/**
 * Who can collect the invoices of an organization, read from the `providers` of
 * the billing capabilities.
 *
 * The console decides what a provider can do from that list (`available`,
 * `connected`, `unavailableReason`, `livemode`, `capabilities.automaticCollection`)
 * and never from `features.stripe`, `features.chargeAutomatically` or
 * `features.publicSurface`. The API fixes those three: it answers `stripe: true`
 * whether or not Stripe can be connected here, and `chargeAutomatically: false` and
 * `publicSurface: false` although the release ships both, so a gate on them would
 * hide automatic collection from a deployment that has it.
 */

export type BillingProviderKind = BillingProvider['kind'];

/** The connector that configures Stripe: the console's route id `stripe` maps to it. */
export const STRIPE_CONNECTOR_NAME = 'kaiten.integration.billing.stripe';

/** The id of the Stripe connector in the address of its page. */
export const STRIPE_CONNECTOR_ROUTE_ID = 'stripe';

/** Why a provider cannot be connected here: its own reasons, or one the console does not know. */
export type ProviderUnavailableReason =
  | 'NOT_ENTITLED'
  | 'UNKNOWN'
  | 'VAULT_NOT_CONFIGURED';

/**
 * Where a provider stands for the organization:
 * - `connected`: its connector is active, and `livemode` says which account it reaches;
 * - `available`: it can be connected here and is not;
 * - `unavailable`: it cannot be connected, for a reason the page says;
 * - `unlisted`: the API does not list it at all (a release older than the provider,
 *   or capabilities that could not be read).
 */
export type ProviderStanding =
  | { state: 'available' }
  | { livemode?: boolean; state: 'connected' }
  | { reason: ProviderUnavailableReason; state: 'unavailable' }
  | { state: 'unlisted' };

/** The entry of a provider in the capabilities, when the API lists it. */
export function findBillingProvider(
  capabilities: BillingCapabilities | undefined,
  kind: BillingProviderKind,
): BillingProvider | undefined {
  return capabilities?.providers.find((provider) => provider.kind === kind);
}

/**
 * Whether the organization can use a provider: it is connected, or it may be.
 * A connected provider that is no longer available (the plan changed) stays
 * usable, since the invoices already issued through it still route there.
 */
export function isProviderOffered(provider: BillingProvider | undefined) {
  return Boolean(provider && (provider.connected || provider.available));
}

/** Where a provider stands, from its entry in the capabilities. */
export function getProviderStanding(
  provider: BillingProvider | undefined,
): ProviderStanding {
  if (!provider) {
    return { state: 'unlisted' };
  }
  if (provider.connected) {
    return { livemode: provider.livemode, state: 'connected' };
  }
  if (provider.available) {
    return { state: 'available' };
  }
  const reason = provider.unavailableReason;

  return {
    reason:
      reason === 'NOT_ENTITLED' || reason === 'VAULT_NOT_CONFIGURED'
        ? reason
        : 'UNKNOWN',
    state: 'unavailable',
  };
}

/** Whether a connected provider charges the customer's payment method by itself. */
export function canChargeAutomatically(
  capabilities: BillingCapabilities | undefined,
): boolean {
  return Boolean(
    capabilities?.providers.some(
      (provider) =>
        provider.connected && provider.capabilities.automaticCollection,
    ),
  );
}

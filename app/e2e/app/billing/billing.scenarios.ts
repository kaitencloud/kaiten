import type { BillingCapabilities } from '@/api-client';
import {
  BillingAppModel,
  CAPABILITIES_OUTAGES,
} from '../_support/model/billing-app-model';
import {
  billingCapabilities,
  billingCapabilitiesProfiles,
} from '../_support/model/billing-capabilities';

/**
 * Billing on, as the API of the local stack serves it: NoOp as the only
 * provider, and no part of the release past the base loop. The profile the specs
 * use unless they say otherwise.
 */
export function createBillingStackModel() {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.stack(),
  });
}

/** Stripe connected, every part of billing shipped. */
export function createBillingFullModel() {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.full(),
  });
}

/**
 * A release that ships the lifecycle and Stripe but not trials, add-ons,
 * vouchers, automatic collection nor the public surface: the console offers only
 * what this release can do.
 */
export function createBillingFeatureGatedModel() {
  return new BillingAppModel({
    capabilities: billingCapabilities({
      features: {
        addons: false,
        chargeAutomatically: false,
        lifecycle: true,
        publicSurface: false,
        stripe: true,
        trials: false,
        vouchers: false,
      },
    }),
  });
}

/** Billing off: on this deployment, or because the plan does not include it. */
export function createBillingDisabledModel(
  reason: NonNullable<BillingCapabilities['disabledReason']>,
) {
  return new BillingAppModel({
    capabilities: billingCapabilitiesProfiles.disabled(reason),
  });
}

/**
 * Billing whose capabilities cannot be read: the caller lacks `read:billing`,
 * the entitlement check is down, the API predates billing, or it never answers.
 * Every one hides billing; none shows an error page.
 */
export function createBillingOutageModel(
  outage: keyof typeof CAPABILITIES_OUTAGES,
) {
  const model = createBillingStackModel();
  model.failCapabilities(CAPABILITIES_OUTAGES[outage]);
  return model;
}

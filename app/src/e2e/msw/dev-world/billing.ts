import type { BillingCapabilities } from '@/api-client';
import { billingCapabilitiesProfiles } from '../../../../e2e/app/_support/model/billing-capabilities';

/**
 * What the mocked console reads of billing: on, with NoOp as the only provider
 * and no part of the release past the base loop, as the API of the local stack
 * answers (docker/config/api.yaml turns billing on). The subscriptions and
 * invoices of the billing screens are attached to the customers, instances and
 * licenses of the world by slug, once those screens exist.
 */
export const createBillingCapabilities = (): BillingCapabilities =>
  billingCapabilitiesProfiles.stack();

import { useBillingCapabilities } from '../queries/billing-capabilities';
import type { BillingFeatureKey } from '../types';
import type { BillingAction } from '../logic';
import { useActionAccess, type ActionAccess } from './use-can-perform';

/** Expansion needs both its operation's scopes and the plan's feature grant. */
export function useBillingFeatureAccess(
  action: BillingAction,
  feature: BillingFeatureKey,
): ActionAccess {
  const access = useActionAccess(action);
  const capabilities = useBillingCapabilities();

  return {
    allowed: access.allowed && capabilities.has(feature),
    isPending: access.isPending || capabilities.isPending,
  };
}

import type { BillingAction } from '../logic';
import { useBillingCapabilities } from '../queries';
import type { BillingFeatureKey } from '../types';
import { useActionAccess } from './use-can-perform';

/**
 * Whether a screen of billing is offered to this session, for a link to it that is
 * left out otherwise (a tab, an entry of a section): billing is on and, when a
 * `feature` is named, the release ships it; and the scopes of the session cover the
 * `action` the screen is for. False while either answer is read, as a link that
 * appears a moment later is better than one that vanishes. The screen's route guards
 * itself as well.
 */
export function useBillingScreenOffered({
  action,
  feature,
}: {
  action: BillingAction;
  feature?: BillingFeatureKey;
}): boolean {
  const billing = useBillingCapabilities();
  const access = useActionAccess(action);

  return billing.has(feature) && access.allowed;
}

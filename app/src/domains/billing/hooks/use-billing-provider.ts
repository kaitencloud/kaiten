import { useQuery } from '@tanstack/react-query';
import {
  type BillingProviderKind,
  findBillingProvider,
  getProviderStanding,
  isProviderOffered,
} from '../logic/billing-providers';
import {
  billingCapabilitiesQueryOptions,
  useBillingCapabilities,
} from '../queries/billing-capabilities';

/**
 * Where one payment provider stands for the organization, read from the billing
 * capabilities: its entry, whether it can be used (connected, or connectable) and
 * where it stands. Nothing is offered while the capabilities load or when billing
 * is off, as everywhere in billing.
 *
 * `listedStanding` is the exception that reads the entry whether billing is on or not:
 * what a tile of the connectors says of Stripe (the plan leaves it out, the deployment
 * needs a Vault) is true where billing is off for that very reason, and is not offered
 * for all that.
 */
export function useBillingProvider(kind: BillingProviderKind) {
  const { capabilities, isPending } = useBillingCapabilities();
  const { data: answered } = useQuery(billingCapabilitiesQueryOptions);
  const provider = findBillingProvider(capabilities, kind);

  return {
    isConnected: Boolean(provider?.connected),
    isOffered: isProviderOffered(provider),
    isPending,
    listedStanding: getProviderStanding(findBillingProvider(answered, kind)),
    provider,
    standing: getProviderStanding(provider),
  };
}

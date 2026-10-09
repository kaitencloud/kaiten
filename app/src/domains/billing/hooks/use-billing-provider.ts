import {
  type BillingProviderKind,
  findBillingProvider,
  getProviderStanding,
  isProviderOffered,
} from '../logic/billing-providers';
import { useBillingCapabilities } from '../queries/billing-capabilities';

/**
 * Where one payment provider stands for the organization, read from the billing
 * capabilities: its entry, whether it can be used (connected, or connectable) and
 * where it stands. Nothing is offered while the capabilities load or when billing
 * is off, as everywhere in billing.
 */
export function useBillingProvider(kind: BillingProviderKind) {
  const { capabilities, isPending } = useBillingCapabilities();
  const provider = findBillingProvider(capabilities, kind);

  return {
    isConnected: Boolean(provider?.connected),
    isOffered: isProviderOffered(provider),
    isPending,
    provider,
    standing: getProviderStanding(provider),
  };
}

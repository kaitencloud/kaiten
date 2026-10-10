import { useQuery } from '@tanstack/react-query';
import { licensesWithPricesQueryOptions } from '../queries/licenses-prices-query-options';
import { useBillingCapabilities } from '../queries/billing-capabilities';

/**
 * The license versions with the prices they are sold at now. Nothing is asked for
 * unless `GET /billing/capabilities` says billing is on: the document is billing's,
 * and a deployment without billing neither shows prices nor receives the request. A
 * screen that needs it for something of its own asks `enabled: false` until then.
 *
 * It does not check the scopes of the session: the screens that read the licenses
 * already need read:licenses, which is all the document asks for, and one that does
 * not hold it gets the refusal of the API, shown as any other.
 */
export function useLicensesWithPrices({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const { isEnabled } = useBillingCapabilities();

  return useQuery({
    ...licensesWithPricesQueryOptions,
    enabled: enabled && isEnabled,
  });
}

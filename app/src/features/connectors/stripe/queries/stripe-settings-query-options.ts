import { queryOptions } from '@tanstack/react-query';
import { getConnectorSettings } from '@/api-client';
import { getConnectorSettingsQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { STRIPE_CONNECTOR_NAME } from '@/domains/billing';
import { isNotFoundError } from '@/lib/errors';

const path = { connectorName: STRIPE_CONNECTOR_NAME } as const;

/**
 * The settings of the Stripe connector, key redacted, or `null` when nothing is
 * stored: the API answers 404 for an organization that never saved any, which is the
 * state of a connector not yet connected and not a failure. Any other refusal is thrown.
 * It keeps the generated key, so that connecting and disconnecting refresh it.
 */
export const stripeSettingsQueryOptions = queryOptions({
  queryKey: getConnectorSettingsQueryKey({ path }),
  queryFn: async ({ signal }) => {
    try {
      const { data } = await getConnectorSettings({
        path,
        signal,
        throwOnError: true,
      });

      return data ?? null;
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  },
  retry: false,
});

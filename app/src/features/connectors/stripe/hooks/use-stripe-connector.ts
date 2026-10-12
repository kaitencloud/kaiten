import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deactivateConnectorMutation,
  updateConnectorSettingsMutation,
} from '@/api-client/@tanstack/react-query.gen';
import {
  invalidateBillingProviderQueries,
  STRIPE_CONNECTOR_NAME,
} from '@/domains/billing';
import type { StripeSettingsFormValues } from '../schemas/stripe-settings.schema';
import { stripeSettingsFormValuesToBody } from '../schemas/stripe-settings.schema';

const path = { connectorName: STRIPE_CONNECTOR_NAME } as const;

/**
 * What a person does to the Stripe connector: saves its settings, which also
 * connects it, and turns it off. Neither is optimistic: the page shows the
 * connector as the API left it, and a refusal (a key Stripe rejects, an account
 * that changed, an invoice that still routes there) is read from the failure by the
 * caller, which shows it where the person is looking. A success refreshes what
 * reads the connection: the capabilities that say whether Stripe is connected, the
 * health of billing and the settings themselves.
 */
export function useStripeConnector() {
  const queryClient = useQueryClient();
  const refresh = () => invalidateBillingProviderQueries(queryClient);

  const save = useMutation({
    ...updateConnectorSettingsMutation(),
    onSuccess: refresh,
  });
  const disconnect = useMutation({
    ...deactivateConnectorMutation(),
    onSuccess: refresh,
  });

  return {
    disconnect: () => disconnect.mutateAsync({ path }),
    isDisconnecting: disconnect.isPending,
    isSaving: save.isPending,
    resetDisconnect: disconnect.reset,
    save: (values: StripeSettingsFormValues) =>
      save.mutateAsync({
        body: stripeSettingsFormValuesToBody(values),
        path,
      }),
  };
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  completePaymentMethodSessionMutation,
  createPaymentMethodSessionMutation,
  createPortalSessionMutation,
  detachPaymentMethodMutation,
} from '@/api-client/@tanstack/react-query.gen';
import {
  handleBillingProblem,
  invalidateCustomerBillingQueries,
} from '@/domains/billing';
import {
  useSingleFlight,
  useSingleFlightMutate,
} from '@/hooks/use-single-flight';
import { getCustomerReturnUrl, leaveToProvider } from '../utils/provider-pages';

/**
 * What a person does to the payment method of a customer in Stripe. Kaiten never
 * sees a card: adding or replacing one sends the browser to a page Stripe hosts, which
 * comes back to the customer with the session in the address, and the console then asks
 * the API to check it with Stripe and keep the labels (`complete`); the portal is
 * Stripe's page for what the customer manages there. Removing one is the only write
 * that stays here. None is optimistic: the card shows what the API answered, and a
 * refusal is read from the failure by the caller.
 */
export function usePaymentMethod(customerSlug: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = () =>
    invalidateCustomerBillingQueries(queryClient, customerSlug);

  const startSetup = useMutation({
    ...createPaymentMethodSessionMutation(),
    onSuccess: ({ url }) => leaveToProvider(url),
  });
  const openPortal = useMutation({
    ...createPortalSessionMutation(),
    onSuccess: ({ url }) => leaveToProvider(url),
  });
  const complete = useMutation({
    ...completePaymentMethodSessionMutation(),
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Customers.Detail.paymentMethod.Toasts.saved'));
    },
  });
  const detach = useMutation({
    ...detachPaymentMethodMutation(),
    // A 409 says the card is not what the page showed: it is read again.
    onError: (error) => {
      if (handleBillingProblem(error).status === 409) {
        void refresh();
      }
    },
    onSuccess: async () => {
      await refresh();
      toast.success(t('Pages.Customers.Detail.paymentMethod.Toasts.removed'));
    },
  });

  // A button waits on `isPending` as it was painted, a frame after the click; each of
  // these answers a second click of the same frame with nothing, the first being out.
  const openPortalOnce = useSingleFlightMutate(openPortal.mutate);
  const retrySetupOnce = useSingleFlightMutate(startSetup.mutate);
  const checkAgainOnce = useSingleFlightMutate(complete.mutate);
  const startSetupOnce = useSingleFlight((currency?: string) =>
    startSetup.mutateAsync({
      body: { currency, returnUrl: getCustomerReturnUrl(customerSlug) },
      path: { customerSlug },
    }),
  );

  return {
    checkAgain: () => {
      if (complete.variables) {
        checkAgainOnce(complete.variables);
      }
    },
    complete,
    detach,
    portal: {
      error: openPortal.error,
      isPending: openPortal.isPending,
      open: () =>
        openPortalOnce({
          body: { returnUrl: getCustomerReturnUrl(customerSlug) },
          path: { customerSlug },
        }),
    },
    setup: {
      error: startSetup.error,
      isPending: startSetup.isPending,
      /** Asks again for the page that was refused, in the currency it was asked in. */
      retry: () => {
        if (startSetup.variables) {
          retrySetupOnce(startSetup.variables);
        }
      },
      /**
       * `currency` is for a customer with no live subscription to take it from. A
       * second call while the first is out is dropped: it resolves at once, the
       * first one being the one that sends the person to Stripe or is refused.
       */
      start: startSetupOnce,
    },
  };
}

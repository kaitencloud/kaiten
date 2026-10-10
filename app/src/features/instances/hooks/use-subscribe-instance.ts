import { useMutation, useQueryClient } from '@tanstack/react-query';
import { subscribeInstanceMutation } from '@/api-client/@tanstack/react-query.gen';
import {
  getProblemCode,
  invalidateInstanceBillingQueries,
} from '@/domains/billing';

/** The refusal that says the tab is out of date: someone subscribed the instance after it was read. */
const ALREADY_SUBSCRIBED = 'SubscribeInstance.AlreadySubscribed';

/**
 * Subscribes an instance. It is not optimistic: the dialog says what the API
 * answered, and a refusal must never show as a success. A subscription that
 * starts changes what the tab, the invoices and the instance itself show (its
 * customer and license are frozen from then on), so all of them are refreshed.
 * So are they when the API says the instance already has one: the dialog says so,
 * and the tab behind it must not go on saying that it has none.
 */
export function useSubscribeInstance(instanceSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    ...subscribeInstanceMutation(),
    onError: (error) => {
      if (getProblemCode(error) === ALREADY_SUBSCRIBED) {
        void invalidateInstanceBillingQueries(queryClient, instanceSlug);
      }
    },
    onSuccess: () =>
      invalidateInstanceBillingQueries(queryClient, instanceSlug),
  });
}

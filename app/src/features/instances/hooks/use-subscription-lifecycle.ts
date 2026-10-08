import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  cancelPlanChangeMutation,
  cancelSubscriptionMutation,
  reactivateSubscriptionMutation,
  schedulePlanChangeMutation,
  updateInstanceBillingMutation,
} from '@/api-client/@tanstack/react-query.gen';
import {
  handleBillingProblem,
  invalidateInstanceBillingQueries,
} from '@/domains/billing';

/**
 * A refusal that says the tab is out of date: the subscription is no longer in
 * the state the person acted on (it was canceled, a change was scheduled, a trial
 * ended meanwhile). A period being closed is no such thing, since nothing changed.
 */
export function isOutOfDate(error: unknown): boolean {
  const problem = handleBillingProblem(error);

  return problem.status === 409 && problem.kind !== 'boundary-pending';
}

/**
 * The changes to the life of a subscription: ending it, taking the ending back,
 * moving it to another plan at the next boundary, dropping that move, and
 * changing the terms of its invoices. None is optimistic: the screen says what
 * the API answered, and a refusal must never show as a success. What a change
 * touches is refreshed with the subscription (its upcoming invoice, its
 * invoices, the instance itself), and so is the tab behind a dialog when the
 * API says the subscription is no longer as it was read.
 */
export function useSubscriptionLifecycle(instanceSlug: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    invalidateInstanceBillingQueries(queryClient, instanceSlug);
  const options = {
    onError: (error: unknown) => {
      if (isOutOfDate(error)) {
        void refresh();
      }
    },
    onSuccess: refresh,
  };

  return {
    cancel: useMutation({ ...cancelSubscriptionMutation(), ...options }),
    cancelPlanChange: useMutation({
      ...cancelPlanChangeMutation(),
      ...options,
    }),
    reactivate: useMutation({
      ...reactivateSubscriptionMutation(),
      ...options,
    }),
    schedulePlanChange: useMutation({
      ...schedulePlanChangeMutation(),
      ...options,
    }),
    updateTerms: useMutation({
      ...updateInstanceBillingMutation(),
      ...options,
    }),
  };
}

import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getProblemCode } from '@/domains/billing';
import { useLifecycleAction } from './use-lifecycle-action';
import { useSubscriptionLifecycle } from './use-subscription-lifecycle';

/**
 * Takes a cancellation scheduled for the end of the period back. A subscription that
 * ended meanwhile cannot be reactivated: the toast that says so offers to subscribe
 * the instance again, which is what is left to do.
 */
export function useReactivateAction(instanceSlug: string) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { reactivate } = useSubscriptionLifecycle(instanceSlug);

  return useLifecycleAction(
    () => reactivate.mutateAsync({ path: { instanceSlug } }),
    () =>
      toast.success(
        t('Pages.Customers.Instances.Detail.Billing.Reactivate.success'),
      ),
    {
      refusalAction: (error) =>
        getProblemCode(error) === 'ReactivateSubscription.Canceled'
          ? {
              label: t(
                'Pages.Customers.Instances.Detail.Billing.Reactivate.subscribeAgain',
              ),
              onClick: () => {
                void navigate({
                  params: { instanceSlug },
                  to: '/customers/instances/$instanceSlug/billing/subscribe',
                });
              },
            }
          : undefined,
    },
  );
}

/** Drops the plan change scheduled for the next boundary. */
export function useCancelPlanChangeAction(instanceSlug: string) {
  const { t } = useTranslation();
  const { cancelPlanChange } = useSubscriptionLifecycle(instanceSlug);

  return useLifecycleAction(
    () => cancelPlanChange.mutateAsync({ path: { instanceSlug } }),
    () =>
      toast.success(
        t('Pages.Customers.Instances.Detail.Billing.PlanChange.droppedToast'),
      ),
  );
}

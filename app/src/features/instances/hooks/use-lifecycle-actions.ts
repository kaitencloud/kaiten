import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useLifecycleAction } from './use-lifecycle-action';
import { useSubscriptionLifecycle } from './use-subscription-lifecycle';

/** Takes a cancellation scheduled for the end of the period back. */
export function useReactivateAction(instanceSlug: string) {
  const { t } = useTranslation();
  const { reactivate } = useSubscriptionLifecycle(instanceSlug);

  return useLifecycleAction(
    () => reactivate.mutateAsync({ path: { instanceSlug } }),
    () =>
      toast.success(
        t('Pages.Customers.Instances.Detail.Billing.Reactivate.success'),
      ),
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

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { placeRefusalOnFields, useBoundaryRetry } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import {
  initialPlanChangeFormValues,
  PLAN_CHANGE_REFUSAL_FIELDS,
  planChangeFormSchema,
  planChangeValuesToBody,
} from '../schemas/plan-change.schema';
import { useSubscriptionLifecycle } from './use-subscription-lifecycle';

type UsePlanChangeFormOptions = {
  instanceSlug: string;
  /** Called once the API accepted the plan change. */
  onScheduled: () => void;
};

/**
 * The form that schedules a move to another plan, and the failure that is about
 * no field. It sends one request however often it is pressed. A period being
 * closed is waited out once, and `closing` says so. A refusal of the plan itself
 * (another currency, a price taken off sale since) is shown on the field, and any
 * other above the buttons; the dialog stays open with what was chosen, since
 * nothing was scheduled and it can be sent again.
 */
export function usePlanChangeForm({
  instanceSlug,
  onScheduled,
}: UsePlanChangeFormOptions) {
  const { t } = useTranslation();
  const { schedulePlanChange } = useSubscriptionLifecycle(instanceSlug);
  const { closing, send } = useBoundaryRetry();
  const [failure, setFailure] = useState<unknown>(null);
  const sending = useRef(false);

  const form = useAppForm({
    defaultValues: initialPlanChangeFormValues,
    listeners: {
      onChange: () => setFailure(null),
    },
    onSubmit: async ({ formApi, value }) => {
      if (sending.current) {
        return;
      }
      sending.current = true;
      setFailure(null);
      try {
        await send(() =>
          schedulePlanChange.mutateAsync({
            body: planChangeValuesToBody(value),
            path: { instanceSlug },
          }),
        );
        toast.success(
          t(
            'Pages.Customers.Instances.Detail.Billing.PlanChange.scheduledToast',
          ),
        );
        onScheduled();
      } catch (error) {
        if (!placeRefusalOnFields(formApi, error, PLAN_CHANGE_REFUSAL_FIELDS)) {
          setFailure(error);
        }
      } finally {
        sending.current = false;
      }
    },
    validators: { onChange: planChangeFormSchema },
  });

  return { closing, failure, form };
}

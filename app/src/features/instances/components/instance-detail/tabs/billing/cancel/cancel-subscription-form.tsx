import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  BoundaryClosingNotice,
  ProblemAlert,
  useCanPerform,
} from '@/domains/billing';
import {
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import { useCancelSubscriptionForm } from '../../../../../hooks/use-cancel-subscription-form';
import { instanceAddonsQueryOptions } from '../../../../../queries';
import type { CancelOutcome } from '../../../../../utils/cancellation.utils';
import { useInstanceDetail } from '../../../instance-detail-context';
import { CancelFields } from './cancel-fields';

type CancelSubscriptionFormProps = {
  onCancel: () => void;
  onCanceled: (outcome: CancelOutcome) => void;
  subscription: InstanceBilling;
};

/**
 * The form that cancels a subscription. It asks when it ends (not for a trial,
 * which ends at once), why, and whether to also take the add-ons off the instance
 * and set the end of its license. The confirmation of an immediate cancellation is
 * a destructive one. A refusal leaves the dialog open with what was typed, above
 * the buttons or on its field, and a period being closed says so and is waited
 * out, not shown as an error.
 */
export function CancelSubscriptionForm({
  onCancel,
  onCanceled,
  subscription,
}: CancelSubscriptionFormProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { instance } = useInstanceDetail();
  const instanceSlug = instance.slug ?? instance.id;
  const mayListAddons = useCanPerform('instance.addons.list');
  const mayDetachAddons = useCanPerform('instance.addons.detach');
  const mayRemoveAddons = mayListAddons && mayDetachAddons;
  const maySetEndDate = useCanPerform('instance.update');
  const addonsQuery = useQuery({
    ...instanceAddonsQueryOptions(instanceSlug),
    enabled: mayRemoveAddons,
  });
  const addons = {
    isError: addonsQuery.isError,
    isPending: mayRemoveAddons && addonsQuery.isPending,
    items: addonsQuery.data ?? [],
  };
  const { closing, failure, form } = useCancelSubscriptionForm({
    addons: addons.items,
    instance,
    onCanceled,
    subscription,
  });
  const isTrial = subscription.status === 'TRIAL';

  return (
    <form.AppForm>
      <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
        <StackedFormDialogFooter>
          <Button onClick={onCancel} type="button" variant="outline">
            {t(
              isTrial
                ? 'Pages.Customers.Instances.Detail.Billing.Cancel.keepTrial'
                : 'Pages.Customers.Instances.Detail.Billing.Cancel.keep',
            )}
          </Button>
          <form.Subscribe selector={(state) => state.values.mode}>
            {(mode) => (
              <form.SubmitButton
                allowPristine
                form={formId}
                label={t(
                  isTrial
                    ? 'Pages.Customers.Instances.Detail.Billing.Cancel.confirmTrial'
                    : 'Pages.Customers.Instances.Detail.Billing.Cancel.confirm',
                )}
                variant={
                  mode === 'IMMEDIATE' && !isTrial ? 'destructive' : 'default'
                }
              />
            )}
          </form.Subscribe>
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <div className="space-y-5">
            <CancelFields
              addons={addons}
              endLicenseDate={instance.endLicenseDate}
              form={form}
              mayRemoveAddons={mayRemoveAddons}
              maySetEndDate={maySetEndDate}
              subscription={subscription}
            />
            {closing ? <BoundaryClosingNotice /> : null}
            {failure && !closing ? (
              <ProblemAlert
                autoFocus
                error={failure}
                onRetry={() => void form.handleSubmit()}
              />
            ) : null}
          </div>
        </StackedFormDialogPanel>
      </form>
    </form.AppForm>
  );
}

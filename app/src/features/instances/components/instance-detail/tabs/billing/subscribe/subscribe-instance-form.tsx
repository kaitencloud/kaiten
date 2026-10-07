import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Customer, Price, StartedSubscription } from '@/api-client';
import { Button } from '@/components/ui/button';
import { billingSettingsQueryOptions, ProblemAlert } from '@/domains/billing';
import {
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import { useSubscribeInstanceForm } from '../../../../../hooks/use-subscribe-instance-form';
import { BillingEmailNotice } from './billing-email-notice';
import { SubscribeFields } from './subscribe-fields';
import { SubscribeSummary } from './subscribe-summary';

type SubscribeInstanceFormProps = {
  customer: Customer;
  instanceSlug: string;
  onCancel: () => void;
  onSubscribed: (started: StartedSubscription) => void;
  /** The prices the instance can be subscribed on, default first. */
  prices: Price[];
};

/**
 * The form that subscribes an instance. It asks only what this release takes: the
 * price to pin the subscription to, the payment terms when they are not the
 * organization's, and when billing starts when it is not now. It sends one request
 * however often it is pressed, and a refusal leaves the dialog open with what was
 * typed, since nothing was started and it can be sent again: the refusal is shown
 * on its field when it is about one, above the buttons otherwise.
 */
export function SubscribeInstanceForm({
  customer,
  instanceSlug,
  onCancel,
  onSubscribed,
  prices,
}: SubscribeInstanceFormProps) {
  const { t } = useTranslation();
  const formId = useId();
  const settings = useQuery(billingSettingsQueryOptions);
  const { failure, form } = useSubscribeInstanceForm({
    instanceSlug,
    onSubscribed,
    prices,
  });

  return (
    <form.AppForm>
      <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
        <StackedFormDialogFooter>
          <Button onClick={onCancel} type="button" variant="outline">
            {t('Common.cancel')}
          </Button>
          <form.SubmitButton
            allowPristine
            form={formId}
            label={t(
              'Pages.Customers.Instances.Detail.Billing.Subscribe.confirm',
            )}
          />
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <div className="space-y-5">
            <SubscribeFields
              defaultDaysUntilDue={settings.data?.defaultDaysUntilDue}
              form={form}
              prices={prices}
            />
            <form.Subscribe
              selector={(state) =>
                [state.values.basePriceId, state.values.startAt] as const
              }
            >
              {([basePriceId, startAt]) => (
                <SubscribeSummary
                  price={prices.find((price) => price.id === basePriceId)}
                  startAt={startAt}
                />
              )}
            </form.Subscribe>
            <BillingEmailNotice customer={customer} />
            {failure ? (
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

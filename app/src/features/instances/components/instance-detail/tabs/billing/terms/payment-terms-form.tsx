import { useQuery } from '@tanstack/react-query';
import { Suspense, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  billingSettingsQueryOptions,
  BoundaryClosingNotice,
  MAX_DAYS_UNTIL_DUE,
  ProblemAlert,
} from '@/domains/billing';
import {
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import { usePaymentTermsForm } from '../../../../../hooks/use-payment-terms-form';

type PaymentTermsFormProps = {
  instanceSlug: string;
  onClose: () => void;
  subscription: InstanceBilling;
};

/**
 * The payment terms of one contract: the days between issuing an invoice and its
 * due date. The dialog says what they are now and where they come from, that the
 * change applies from the next invoice on, and offers the terms of the
 * organization back when the contract has terms of its own. An empty field is
 * those terms too.
 */
export function PaymentTermsForm({
  instanceSlug,
  onClose,
  subscription,
}: PaymentTermsFormProps) {
  const { t } = useTranslation();
  const formId = useId();
  const settings = useQuery(billingSettingsQueryOptions);
  const { closing, failure, form, isSending, resetToDefault } =
    usePaymentTermsForm({ instanceSlug, onSaved: onClose, subscription });
  const own = subscription.daysUntilDueOverride !== undefined;
  const defaultDays = settings.data?.defaultDaysUntilDue;

  return (
    <form.AppForm>
      <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
        <StackedFormDialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t('Common.cancel')}
          </Button>
          {own ? (
            <Button
              disabled={isSending}
              onClick={resetToDefault}
              type="button"
              variant="outline"
            >
              {t('Pages.Customers.Instances.Detail.Billing.Terms.useDefault')}
            </Button>
          ) : null}
          <form.SubmitButton
            form={formId}
            label={t('Pages.Customers.Instances.Detail.Billing.Terms.save')}
          />
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <div className="space-y-5">
            <p className="text-sm" data-testid="payment-terms-current">
              {t(
                own
                  ? 'Pages.Customers.Instances.Detail.Billing.Terms.currentContract'
                  : 'Pages.Customers.Instances.Detail.Billing.Terms.currentOrganization',
                { count: subscription.daysUntilDue },
              )}
            </p>
            <Suspense fallback={null}>
              <form.AppField name="daysUntilDue">
                {(field) => (
                  <field.NumberField
                    // More than a year is refused in words, and not changed to a year.
                    allowOutOfRange
                    description={t(
                      'Pages.Customers.Instances.Detail.Billing.Terms.daysUntilDueHint',
                    )}
                    label={t(
                      'Pages.Customers.Instances.Detail.Billing.Terms.daysUntilDue',
                    )}
                    max={MAX_DAYS_UNTIL_DUE}
                    min={0}
                    placeholder={
                      defaultDays === undefined
                        ? t(
                            'Pages.Customers.Instances.Detail.Billing.Terms.placeholderUnknown',
                          )
                        : t(
                            'Pages.Customers.Instances.Detail.Billing.Terms.placeholder',
                            { days: defaultDays },
                          )
                    }
                    step={1}
                  />
                )}
              </form.AppField>
            </Suspense>
            <p className="text-sm text-muted-foreground">
              {t('Pages.Customers.Instances.Detail.Billing.Terms.nextInvoice')}
            </p>
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

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { InstanceBilling, SubscriptionTerms } from '@/api-client';
import { placeRefusalOnFields, useBoundaryRetry } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import {
  PAYMENT_TERMS_REFUSAL_FIELDS,
  paymentTermsFormSchema,
  paymentTermsValuesToBody,
} from '../schemas/payment-terms.schema';
import { useSubscriptionLifecycle } from './use-subscription-lifecycle';

type UsePaymentTermsFormOptions = {
  instanceSlug: string;
  /** Called once the API accepted the change. */
  onSaved: () => void;
  subscription: InstanceBilling;
};

/**
 * The form of the payment terms of a contract, and the two ways to change them:
 * a number of days for this deal, or the terms of the organization back. They
 * apply from the next invoice on, so the change shows in the subscription and in
 * none of the invoices already issued. It sends one request however often it is
 * pressed. A period being closed is waited out once, and `closing` says so; any
 * other refusal leaves the dialog open with what was typed, on the field when it is
 * about it and above the buttons otherwise.
 */
export function usePaymentTermsForm({
  instanceSlug,
  onSaved,
  subscription,
}: UsePaymentTermsFormOptions) {
  const { t } = useTranslation();
  const { updateTerms } = useSubscriptionLifecycle(instanceSlug);
  const { closing, send } = useBoundaryRetry();
  const [failure, setFailure] = useState<unknown>(null);
  const sending = useRef(false);

  async function save(
    body: SubscriptionTerms,
    formApi: Parameters<typeof placeRefusalOnFields>[0],
  ) {
    if (sending.current) {
      return;
    }
    sending.current = true;
    setFailure(null);
    try {
      await send(() =>
        updateTerms.mutateAsync({ body, path: { instanceSlug } }),
      );
      toast.success(
        t(
          body.daysUntilDue === null
            ? 'Pages.Customers.Instances.Detail.Billing.Terms.Toasts.reset'
            : 'Pages.Customers.Instances.Detail.Billing.Terms.Toasts.saved',
        ),
      );
      onSaved();
    } catch (error) {
      if (!placeRefusalOnFields(formApi, error, PAYMENT_TERMS_REFUSAL_FIELDS)) {
        setFailure(error);
      }
    } finally {
      sending.current = false;
    }
  }

  const form = useAppForm({
    defaultValues: {
      daysUntilDue: subscription.daysUntilDueOverride ?? Number.NaN,
    },
    listeners: {
      onChange: () => setFailure(null),
    },
    onSubmit: ({ formApi, value }) =>
      save(paymentTermsValuesToBody(value), formApi),
    validators: { onChange: paymentTermsFormSchema },
  });

  return {
    closing,
    failure,
    form,
    isSending: updateTerms.isPending,
    /** Puts the terms of the organization back, whatever the field holds. */
    resetToDefault: () => void save({ daysUntilDue: null }, form),
  };
}

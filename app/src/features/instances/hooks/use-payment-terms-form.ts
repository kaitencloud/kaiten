import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { InstanceBilling, SubscriptionTerms } from '@/api-client';
import { placeRefusalOnFields, useBoundaryRetry } from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import {
  PAYMENT_TERMS_REFUSAL_FIELDS,
  type PaymentTermsFormValues,
  paymentTermsFormSchema,
  paymentTermsValuesToBody,
} from '../schemas/payment-terms.schema';
import { useSubscriptionLifecycle } from './use-subscription-lifecycle';

type UsePaymentTermsFormOptions = {
  instanceSlug: string;
  /** Called once the API accepted the change. */
  onSaved: () => void;
  subscription: InstanceBilling;
  /**
   * Whether the form also changes who collects the invoices and how: where a payment
   * provider is connected, or collects the contract already. The form holds the
   * provider and the method then, and sends them when they change.
   */
  withProvider?: boolean;
};

/**
 * The form of the payment terms of a contract, and the two ways to change them:
 * a number of days for this deal, or the terms of the organization back. Where a
 * payment provider can collect, it also changes who collects the invoices and how.
 * They apply from the next invoice on, so the change shows in the subscription and in
 * none of the invoices already issued. It sends one request however often it is
 * pressed. A period being closed is waited out once, and `closing` says so; any
 * other refusal leaves the dialog open with what was typed, on the field when it is
 * about it and above the buttons otherwise.
 *
 * Moving to the organization's own system collects by sending the invoice, as that is
 * the only way it collects: the method follows the provider when the provider is chosen.
 */
export function usePaymentTermsForm({
  instanceSlug,
  onSaved,
  subscription,
  withProvider = false,
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
      // The terms of the organization apply again only when that is all that changed.
      const resetOnly =
        body.daysUntilDue === null &&
        body.providerKind === undefined &&
        body.collectionMethod === undefined;
      toast.success(
        t(
          resetOnly
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

  const defaultValues: PaymentTermsFormValues = {
    daysUntilDue: subscription.daysUntilDueOverride ?? Number.NaN,
    ...(withProvider
      ? {
          collectionMethod: subscription.collectionMethod,
          providerKind: subscription.providerKind,
        }
      : {}),
  };
  const form = useAppForm({
    defaultValues,
    listeners: {
      onChange: ({ fieldApi, formApi }) => {
        setFailure(null);
        // The organization's own system collects by sending the invoice.
        if (
          fieldApi.name === 'providerKind' &&
          fieldApi.state.value === 'NOOP'
        ) {
          formApi.setFieldValue('collectionMethod', 'SEND_INVOICE');
        }
      },
    },
    onSubmit: ({ formApi, value }) =>
      save(paymentTermsValuesToBody(value, subscription), formApi),
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

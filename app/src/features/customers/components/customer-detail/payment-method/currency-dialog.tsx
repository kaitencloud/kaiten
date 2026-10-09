import { useTranslation } from 'react-i18next';
import { BillingActionDialog, useBillingActionForm } from '@/domains/billing';
import { createFormSubmitHandler } from '@/hooks/form';
import {
  PAYMENT_METHOD_CURRENCIES,
  PAYMENT_METHOD_CURRENCY_REFUSAL_FIELDS,
  paymentMethodCurrencySchema,
} from '../../../schemas/payment-method-currency.schema';

type CurrencyDialogProps = {
  onClose: () => void;
  /** Asks the API for the page where the payment method is saved, in this currency. It throws what the API refused with. */
  onSubmit: (currency: string) => Promise<unknown>;
};

/**
 * Asks which currency a payment method is set up in. The API takes it from the live
 * subscription of the customer, and a customer that has none has to say: this dialog is
 * what the person sees when the API said so. Continuing sends the browser to the page
 * Stripe hosts, so the dialog is not closed by its own success.
 */
export function CurrencyDialog({ onClose, onSubmit }: CurrencyDialogProps) {
  const { t } = useTranslation();
  const { failure, form, formId, retry } = useBillingActionForm({
    defaultValues: { currency: '' },
    fields: PAYMENT_METHOD_CURRENCY_REFUSAL_FIELDS,
    onClose: () => {},
    request: ({ currency }) => onSubmit(currency),
    schema: paymentMethodCurrencySchema,
  });
  const base = 'Pages.Customers.Detail.paymentMethod.Currency';

  return (
    <form.AppForm>
      <BillingActionDialog
        confirm={
          <form.SubmitButton form={formId} label={t(`${base}.confirm`)} />
        }
        description={t(`${base}.description`)}
        failure={failure}
        loadingFields={1}
        onClose={onClose}
        onRetry={retry}
        title={t(`${base}.title`)}
      >
        <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
          <form.AppField name="currency">
            {(field) => (
              <field.ComboboxField
                description={t(`${base}.hint`)}
                getOptionLabel={(code: unknown) => String(code)}
                getOptionValue={(code: unknown) => String(code)}
                label={t(`${base}.label`)}
                options={PAYMENT_METHOD_CURRENCIES}
                placeholder={t(`${base}.placeholder`)}
                required
                searchPlaceholder={t(`${base}.search`)}
              />
            )}
          </form.AppField>
        </form>
      </BillingActionDialog>
    </form.AppForm>
  );
}

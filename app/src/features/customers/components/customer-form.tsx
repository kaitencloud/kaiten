import { Button } from '@/components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type { Customer } from '@/api-client';
import { placeRefusalOnFields } from '@/domains/billing';
import {
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { useCustomerBilling } from '../hooks/use-customer-billing';
import { useCustomerFormMutations } from './customer-form.mutations';
import {
  CUSTOMER_REFUSAL_FIELDS,
  customerFormSchema,
  customerFormValuesToCreateBody,
  customerFormValuesToUpdateBody,
  customerToFormValues,
  initialCustomerFormValues,
} from './customer-form.shared';
import { CustomerFormFields } from './customer-form-fields';

type CustomerFormProps = {
  customer?: Customer;
  onSuccess?: (customer: Customer) => void;
  onCancel?: () => void;
  panelClassName?: string;
};

export const CustomerForm = ({
  customer,
  onSuccess,
  onCancel,
  panelClassName,
}: CustomerFormProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const formId = useId();
  const { createMutation, updateMutation } = useCustomerFormMutations(customer);
  const { isBillingEnabled } = useCustomerBilling();

  function backToList() {
    navigate({ to: '/customers' });
  }

  function handleSuccess(savedCustomer: Customer) {
    if (onSuccess) {
      onSuccess(savedCustomer);
      return;
    }

    backToList();
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }

    backToList();
  }

  const form = useAppForm({
    defaultValues: customer
      ? customerToFormValues(customer)
      : initialCustomerFormValues,
    validators: {
      onChange: customerFormSchema,
    },
    onSubmit: async ({ formApi, value }) => {
      try {
        // An update may answer with no body; the customer being edited then
        // stands in, since only its slug is needed downstream.
        const savedCustomer = customer
          ? ((await updateMutation.mutateAsync({
              path: { customerSlug: customer.slug! },
              body: customerFormValuesToUpdateBody(value),
            })) ?? customer)
          : await createMutation.mutateAsync({
              body: customerFormValuesToCreateBody(value),
            });
        handleSuccess(savedCustomer);
      } catch (e) {
        if (!placeRefusalOnFields(formApi, e, CUSTOMER_REFUSAL_FIELDS)) {
          toast.error(getApiErrorMessage(e));
        }
      }
    },
  });

  return (
    <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
      <form.AppForm>
        <StackedFormDialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            {t('Common.cancel')}
          </Button>
          <form.SubmitButton
            form={formId}
            label={
              customer
                ? t('Pages.Customers.Mutation.Form.updateButton')
                : t('Pages.Customers.Mutation.Form.createButton')
            }
          />
        </StackedFormDialogFooter>
        <StackedFormDialogPanel className={panelClassName}>
          <div className="space-y-6">
            <CustomerFormFields
              form={form}
              isEditing={!!customer}
              showBillingEmail={isBillingEnabled}
            />
          </div>
        </StackedFormDialogPanel>
      </form.AppForm>
    </form>
  );
};

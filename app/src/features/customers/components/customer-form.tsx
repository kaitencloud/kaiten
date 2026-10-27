import { Button } from '@/components/ui/button';
import { Link, useNavigate } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type { Customer } from '@/api-client';
import { placeRefusalOnFields } from '@/domains/billing';
import {
  type FormRecovery,
  FormRecoveryAlert,
  FormRecoveryNotes,
  FormRecoverySubmitWarning,
  useFormRecovery,
  useFormRecoveryForm,
} from '@/functionals/form-recovery';
import {
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { useCustomerBilling } from '../hooks/use-customer-billing';
import { useCustomerFormMutations } from './customer-form.mutations';
import {
  CUSTOMER_REFUSAL_FIELDS,
  createCustomerFormSchema,
  customerFormSchema,
  customerFormValuesToCreateBody,
  type CustomerFormValues,
  customerFormValuesToUpdateBody,
  customerToFormValues,
  initialCustomerFormValues,
} from './customer-form.shared';
import { CustomerFormFields } from './customer-form-fields';
import { customerRecovery } from './customer-recovery';

type CustomerFormProps = {
  customer?: Customer;
  onSuccess?: (customer: Customer) => void;
  onCancel?: () => void;
  panelClassName?: string;
  /**
   * The recovery of the creation, opened by the dialog outside this form: the form
   * starts from its values and sends the creation through it. Without one, nothing is
   * kept.
   */
  recovery?: FormRecovery<CustomerFormValues>;
};

export const CustomerForm = ({
  customer,
  onSuccess,
  onCancel,
  panelClassName,
  recovery: givenRecovery,
}: CustomerFormProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const formId = useId();
  const { createMutation, updateMutation } = useCustomerFormMutations(customer);
  const { isBillingEnabled } = useCustomerBilling();
  // A form given no recovery keeps nothing: an off door reads and writes nothing.
  const offRecovery = useFormRecovery(customerRecovery, {
    enabled: false,
    pristine: initialCustomerFormValues,
  });
  const recovery = givenRecovery ?? offRecovery;
  // What the form opened with, kept as it was: an update sends the fields that
  // differ from it, and takes the others from the customer as the API holds it.
  const [openedValues] = useState(() =>
    customer ? customerToFormValues(customer) : recovery.pristine,
  );

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
    // A deliberate abandon: the entries go, and a toast offers to bring them back.
    if (!customer) {
      recovery.discard({ undo: () => void navigate({ to: '/customers/new' }) });
    }
    if (onCancel) {
      onCancel();
      return;
    }

    backToList();
  }

  // The body is built before the request: an error while building it is not an answer
  // that never came. What was created is named by its slug, never by the customer's name.
  const createCustomer = (body: ReturnType<typeof customerFormValuesToCreateBody>) =>
    recovery.send(() => createMutation.mutateAsync({ body }), {
      created: (created) => ({
        id: created.slug ?? created.id ?? '',
        label: created.slug ?? '',
      }),
    });
  // The billing e-mail is never kept: the offer says it is to be entered again.
  const omittedLabels = {
    billingEmail: t('Pages.Customers.Mutation.Form.Labels.billingEmail'),
  };

  const form = useAppForm({
    defaultValues: openedValues,
    validators: {
      onChange: customer ? customerFormSchema : createCustomerFormSchema,
    },
    onSubmit: async ({ formApi, value }) => {
      try {
        // An update may answer with no body; the customer being edited then
        // stands in, since only its slug is needed downstream.
        const savedCustomer = customer
          ? ((await updateMutation.mutateAsync({
              customerSlug: customer.slug!,
              edited: customerFormValuesToUpdateBody(value),
              opened: customerFormValuesToUpdateBody(openedValues),
            })) ?? customer)
          : await createCustomer(customerFormValuesToCreateBody(value));
        handleSuccess(savedCustomer);
      } catch (e) {
        if (!placeRefusalOnFields(formApi, e, CUSTOMER_REFUSAL_FIELDS)) {
          toast.error(getApiErrorMessage(e));
        }
      }
    },
  });

  const { focusRef } = useFormRecoveryForm(recovery, form);

  return (
    <form
      id={formId}
      ref={focusRef}
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
    >
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
            <FormRecoveryAlert
              fieldLabels={omittedLabels}
              recovery={recovery}
            >
              <CustomerListLink />
            </FormRecoveryAlert>
            <FormRecoveryNotes fieldLabels={omittedLabels} recovery={recovery} />
            <CustomerFormFields
              form={form}
              isEditing={!!customer}
              showBillingEmail={isBillingEnabled}
            />
            <FormRecoverySubmitWarning recovery={recovery}>
              <CustomerListLink />
            </FormRecoverySubmitWarning>
          </div>
        </StackedFormDialogPanel>
      </form.AppForm>
    </form>
  );
};

function CustomerListLink() {
  const { t } = useTranslation();

  return (
    <Button
      nativeButton={false}
      render={<Link to="/customers" />}
      size="sm"
      variant="outline"
    >
      {t('Common.viewList')}
    </Button>
  );
}

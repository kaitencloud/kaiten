import { useImperativeHandle, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { Variant } from '@/api-client';
import { FormStateBridge } from '@/components/form/form-state-bridge';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { basicTargetingFormSchema } from '../schemas/targeting.schema';
import type { BasicTargetingFormValues } from '../types';
import { TargetingBaseFields } from './targeting-base-fields';

type BasicTargetingFormProps = {
  onSubmit: (values: BasicTargetingFormValues) => void;
  variants: Variant[];
  initialValues?: BasicTargetingFormValues;
  onFormStateChange?: (state: {
    canSubmit: boolean;
    isSubmitting: boolean;
    isPristine: boolean;
    isValidating: boolean;
  }) => void;
  disableCelValidation?: boolean;
};

export type BasicTargetingFormRef = {
  submit: () => void;
};

export function BasicTargetingForm({
  onSubmit,
  variants,
  initialValues,
  onFormStateChange,
  disableCelValidation = false,
  ref,
}: BasicTargetingFormProps & { ref?: Ref<BasicTargetingFormRef> }) {
  const { t } = useTranslation();

  const form = useAppForm({
    defaultValues: initialValues || {
      type: 'basic' as const,
      name: '',
      rule: '',
      variant: '',
    },
    validators: {
      onChange: basicTargetingFormSchema,
    },
    onSubmit: async ({ value }) => {
      onSubmit(value);
    },
  });

  useImperativeHandle(ref, () => ({
    submit: () => form.handleSubmit(),
  }));

  return (
    <form
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
      id="basic-targeting-form"
    >
      <form.AppForm>
        <div className="space-y-6">
          <TargetingBaseFields
            form={form}
            fields={{
              name: 'name',
              rule: 'rule',
            }}
            translationKeyPrefix="Features.Targeting.BasicForm"
            disableCelValidation={disableCelValidation}
          />

          <form.AppField name="variant">
            {(field) => (
              <field.SelectField
                label={`${t('Features.Targeting.BasicForm.variant')} *`}
                placeholder={t(
                  'Features.Targeting.BasicForm.variantPlaceholder',
                )}
                options={variants}
                getOptionLabel={(option: unknown) => {
                  const v = option as Variant;
                  return `${v.name} - ${v.description}`;
                }}
                getOptionValue={(option: unknown) => {
                  const v = option as Variant;
                  return v.name;
                }}
              />
            )}
          </form.AppField>
        </div>
        {onFormStateChange && (
          <form.Subscribe<{
            canSubmit: boolean;
            isSubmitting: boolean;
            isPristine: boolean;
            isValidating: boolean;
          }>
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
              isPristine: state.isPristine,
              isValidating: state.isValidating,
            })}
          >
            {(state) => (
              <FormStateBridge {...state} onChange={onFormStateChange} />
            )}
          </form.Subscribe>
        )}
      </form.AppForm>
    </form>
  );
}

BasicTargetingForm.displayName = 'BasicTargetingForm';

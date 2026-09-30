import { useImperativeHandle, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { Variant } from '@/api-client';
import { FormStateBridge } from '@/components/form/form-state-bridge';
import { RolloutDateConfig } from '../../rollout';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { rolloutDateTargetingFormSchema } from '../schemas/targeting.schema';
import type { RolloutDateTargetingFormValues } from '../types';
import { TargetingBaseFields } from './targeting-base-fields';

type RolloutDateTargetingFormProps = {
  onSubmit: (values: RolloutDateTargetingFormValues) => void;
  variants: Variant[];
  initialValues?: RolloutDateTargetingFormValues;
  onFormStateChange?: (state: {
    canSubmit: boolean;
    isSubmitting: boolean;
    isPristine: boolean;
    isValidating: boolean;
  }) => void;
  disableCelValidation?: boolean;
};

export type RolloutDateTargetingFormRef = {
  submit: () => void;
};

export function RolloutDateTargetingForm({
  onSubmit,
  variants,
  initialValues,
  onFormStateChange,
  disableCelValidation = false,
  ref,
}: RolloutDateTargetingFormProps & { ref?: Ref<RolloutDateTargetingFormRef> }) {
  const { t } = useTranslation();

  const form = useAppForm({
    defaultValues: initialValues || {
      type: 'rollout_date' as const,
      name: '',
      rule: '',
      start: {
        date: '',
        percentage: 0,
        variant: '',
      },
      end: {
        date: '',
        percentage: 100,
        variant: '',
      },
    },
    validators: {
      onChange: rolloutDateTargetingFormSchema,
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
      id="rollout-date-targeting-form"
    >
      <form.AppForm>
        <div className="space-y-6">
          <TargetingBaseFields
            form={form}
            fields={{
              name: 'name',
              rule: 'rule',
            }}
            translationKeyPrefix="Features.Targeting.RolloutDateForm"
            disableCelValidation={disableCelValidation}
          />

          <form.Subscribe<RolloutDateTargetingFormValues>
            selector={(state) => state.values}
          >
            {(values) => (
              <RolloutDateConfig
                value={values}
                variants={variants}
                onChange={(newValues) => {
                  form.setFieldValue('start', newValues.start);
                  form.setFieldValue('end', newValues.end);
                }}
                renderDatePicker={({ label }) => {
                  const fieldName =
                    label === t('Features.Targeting.RolloutDateForm.startDate')
                      ? 'start.date'
                      : 'end.date';
                  return (
                    <form.AppField name={fieldName as any}>
                      {(field) => (
                        <field.DatePickerField
                          useISOString
                          label={`${label} *`}
                          placeholder={label}
                        />
                      )}
                    </form.AppField>
                  );
                }}
                renderSelectField={({ label, options }) => {
                  const fieldName =
                    label ===
                    `${t('Features.Targeting.RolloutDateForm.startVariant')} *`
                      ? 'start.variant'
                      : 'end.variant';
                  return (
                    <form.AppField name={fieldName as any}>
                      {(field) => (
                        <field.SelectField
                          label={label}
                          options={options}
                          placeholder={t(
                            'Features.Targeting.RolloutDateForm.variantPlaceholder',
                          )}
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
                  );
                }}
              />
            )}
          </form.Subscribe>
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

RolloutDateTargetingForm.displayName = 'RolloutDateTargetingForm';

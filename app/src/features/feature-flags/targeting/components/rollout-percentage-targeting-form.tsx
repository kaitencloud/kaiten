import { useImperativeHandle, type Ref } from 'react';
import type { Variant } from '@/api-client';
import { FormStateBridge } from '@/components/form/form-state-bridge';
import { RolloutPercentageConfig } from '../../rollout';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { rolloutPercentageTargetingFormSchema } from '../schemas/targeting.schema';
import type { RolloutPercentageTargetingFormValues } from '../types';
import { TargetingBaseFields } from './targeting-base-fields';

type RolloutPercentageTargetingFormProps = {
  onSubmit: (values: RolloutPercentageTargetingFormValues) => void;
  variants: Variant[];
  initialValues?: RolloutPercentageTargetingFormValues;
  onFormStateChange?: (state: {
    canSubmit: boolean;
    isSubmitting: boolean;
    isPristine: boolean;
    isValidating: boolean;
  }) => void;
  disableCelValidation?: boolean;
};

export type RolloutPercentageTargetingFormRef = {
  submit: () => void;
};

export function RolloutPercentageTargetingForm({
  onSubmit,
  variants,
  initialValues,
  onFormStateChange,
  disableCelValidation = false,
  ref,
}: RolloutPercentageTargetingFormProps & {
  ref?: Ref<RolloutPercentageTargetingFormRef>;
}) {
  const form = useAppForm({
    defaultValues: initialValues || {
      type: 'rollout_percentage' as const,
      name: '',
      rule: '',
      distribution: {} as Record<string, number>,
    },
    validators: {
      onChange: rolloutPercentageTargetingFormSchema,
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
      id="rollout-percentage-targeting-form"
    >
      <form.AppForm>
        <div className="space-y-6">
          <TargetingBaseFields
            form={form}
            fields={{
              name: 'name',
              rule: 'rule',
            }}
            translationKeyPrefix="Features.Targeting.RolloutPercentageForm"
            disableCelValidation={disableCelValidation}
          />

          <form.AppField name="distribution">
            {(field) => (
              <RolloutPercentageConfig
                distribution={field.state.value || {}}
                variants={variants}
                onChange={(newDistribution) =>
                  field.handleChange(newDistribution)
                }
                errors={
                  field.state.meta.errors && field.state.meta.errors.length > 0
                    ? field.state.meta.errors.map((e) => e?.message || '')
                    : []
                }
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

RolloutPercentageTargetingForm.displayName = 'RolloutPercentageTargetingForm';

import { StepNextButton } from '@/components/form/step-next-button';
import { Button } from '@/components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import {
  StackedFormDialogCard,
  StackedFormDialogDirtyState,
  useStackedFormDialogClose,
} from '@/functionals/stacked-form-dialog';
import {
  StepStack,
  StepStackContainer,
  StepStackPrevious,
  StepStackStep,
  useStepStack,
} from '@/functionals/step-stack';
import { createFormSubmitHandler } from '@/hooks/form';
import {
  EntitlementIdentityFields,
  EntitlementTypeFields,
} from './entitlement-form-fields';
import {
  type EntitlementFormProps,
  type EntitlementFormValues,
  entitlementIdentityStepSchema,
  getIdentityStepValues,
} from './entitlement-form.shared';
import { EntitlementRefusalAlert } from './entitlement-refusal-alert';
import { useEntitlementMutationForm } from './use-entitlement-mutation-form';

export const EntitlementForm = ({
  entitlement,
  layout = 'page',
  onSuccess,
  onCancel,
}: EntitlementFormProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const requestClose = useStackedFormDialogClose();
  const formId = useId();
  const { form, refusal } = useEntitlementMutationForm(entitlement, onSuccess);
  // The type is immutable once set, so an existing non-NUMBER entitlement has
  // nothing left to configure on a second step — collapse the wizard to a
  // single step. NUMBER keeps its step for the meter/unit configuration.
  const showTypeStep =
    !entitlement ||
    entitlement.type === 'NUMBER' ||
    entitlement.type === 'NUMBER_AI_CREDIT';
  const refusalAlert = refusal ? (
    <EntitlementRefusalAlert messageKey={refusal} />
  ) : null;

  function handleCancel() {
    if (requestClose) {
      requestClose();
      return;
    }
    if (onCancel) {
      onCancel();
      return;
    }

    navigate({ to: '/catalog/entitlements' });
  }

  const submitButton = (
    <form.SubmitButton
      form={layout === 'dialog' ? formId : undefined}
      label={
        entitlement
          ? t('Pages.Entitlements.Mutation.Form.updateButton')
          : t('Pages.Entitlements.Mutation.Form.createButton')
      }
    />
  );

  const identityFooter = showTypeStep ? (
    <EntitlementIdentityStepFooter form={form} onCancel={handleCancel} />
  ) : (
    <>
      <Button type="button" variant="outline" onClick={handleCancel}>
        {t('Common.cancel')}
      </Button>
      {submitButton}
    </>
  );

  const steps = [
    <StepStackStep key="identity">
      <EntitlementIdentityStepCard
        entitlement={entitlement}
        form={form}
        footer={identityFooter}
        notice={showTypeStep ? null : refusalAlert}
      />
    </StepStackStep>,
  ];

  if (showTypeStep) {
    steps.push(
      <StepStackStep key="type">
        <EntitlementTypeStepCard
          entitlement={entitlement}
          form={form}
          notice={refusalAlert}
          submitButton={submitButton}
        />
      </StepStackStep>,
    );
  }

  return (
    <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
      <form.AppForm>
        <form.Subscribe selector={(state) => state.isDefaultValue}>
          {(isDefaultValue) => (
            <StackedFormDialogDirtyState dirty={!isDefaultValue} />
          )}
        </form.Subscribe>
        {layout === 'dialog' ? (
          <StepStack embedded orientation="bottom-right">
            <StepStackContainer className="justify-start">
              {steps}
            </StepStackContainer>
          </StepStack>
        ) : (
          <div className="space-y-4">
            <EntitlementIdentityFields
              className="space-y-4"
              entitlement={entitlement}
              form={form}
            />
            <EntitlementTypeFields
              className="space-y-4"
              entitlement={entitlement}
              form={form}
            />
            {refusalAlert}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCancel}>
                {t('Common.cancel')}
              </Button>
              {submitButton}
            </div>
          </div>
        )}
      </form.AppForm>
    </form>
  );
};

function EntitlementIdentityStepCard({
  entitlement,
  footer,
  form,
  notice,
}: {
  entitlement?: Entitlement;
  footer: ReactNode;
  form: any;
  /** What the API refused, above the buttons, when this step has them. */
  notice: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <StackedFormDialogCard loadingFields={4} footer={footer}>
      <div className="space-y-6">
        <h3 className="font-semibold text-xl">
          {t(
            'Pages.Entitlements.Mutation.Form.Steps.identity',
            'Entitlement information',
          )}
        </h3>

        <EntitlementIdentityFields
          className="space-y-6"
          entitlement={entitlement}
          form={form}
        />

        {notice}
      </div>
    </StackedFormDialogCard>
  );
}

function EntitlementTypeStepCard({
  entitlement,
  form,
  notice,
  submitButton,
}: {
  entitlement?: Entitlement;
  form: any;
  /** What the API refused, above the buttons. */
  notice: ReactNode;
  submitButton: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <StackedFormDialogCard
      loadingFields={6}
      footer={
        <>
          <StepStackPreviousButton />
          {submitButton}
        </>
      }
    >
      <div className="space-y-6">
        <h3 className="font-semibold text-xl">
          {t(
            'Pages.Entitlements.Mutation.Form.Steps.type',
            'Type configuration',
          )}
        </h3>

        <EntitlementTypeFields
          className="space-y-6"
          entitlement={entitlement}
          form={form}
        />

        {notice}
      </div>
    </StackedFormDialogCard>
  );
}

const ValidatedStepNextButton = ({
  label,
  disabled,
}: {
  label: string;
  disabled: boolean;
}) => {
  const { nextStep } = useStepStack();

  return (
    <StepNextButton disabled={disabled} onClick={nextStep}>
      {label}
    </StepNextButton>
  );
};

const StepStackPreviousButton = () => {
  const { t } = useTranslation();

  return (
    <StepStackPrevious asChild>
      <Button type="button" variant="outline">
        {t('Common.previous', 'Previous')}
      </Button>
    </StepStackPrevious>
  );
};

function EntitlementIdentityStepFooter({
  form,
  onCancel,
}: {
  form: any;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('Common.cancel')}
      </Button>
      <form.Subscribe
        selector={(state: { values: EntitlementFormValues }) => state}
      >
        {(state: { values: EntitlementFormValues }) => {
          const validationResult = entitlementIdentityStepSchema.safeParse(
            getIdentityStepValues(state.values),
          );
          return (
            <ValidatedStepNextButton
              label={t('Common.next', 'Next')}
              disabled={!validationResult.success}
            />
          );
        }}
      </form.Subscribe>
    </>
  );
}

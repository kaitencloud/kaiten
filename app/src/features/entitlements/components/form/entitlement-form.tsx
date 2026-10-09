import { Button } from '@/components/ui/button';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { StackedFormDialogCard } from '@/functionals/stacked-form-dialog';
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
} from './entitlement-form.shared';
import { useEntitlementMutationForm } from './use-entitlement-mutation-form';

export const EntitlementForm = ({
  entitlement,
  layout = 'page',
  onSuccess,
  onCancel,
}: EntitlementFormProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const formId = useId();
  const form = useEntitlementMutationForm(entitlement, onSuccess);
  // The type is immutable once set, so an existing non-NUMBER entitlement has
  // nothing left to configure on a second step — collapse the wizard to a
  // single step. NUMBER keeps its step for the meter/unit configuration.
  const showTypeStep = !entitlement || entitlement.type === 'NUMBER';

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }

    navigate({ to: '/entitlements' });
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
      />
    </StepStackStep>,
  ];

  if (showTypeStep) {
    steps.push(
      <StepStackStep key="type">
        <EntitlementTypeStepCard
          entitlement={entitlement}
          form={form}
          submitButton={submitButton}
        />
      </StepStackStep>,
    );
  }

  return (
    <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
      <form.AppForm>
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
}: {
  entitlement?: Entitlement;
  footer: ReactNode;
  form: any;
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
      </div>
    </StackedFormDialogCard>
  );
}

function EntitlementTypeStepCard({
  entitlement,
  form,
  submitButton,
}: {
  entitlement?: Entitlement;
  form: any;
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
    <Button type="button" disabled={disabled} onClick={nextStep}>
      {label}
    </Button>
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
          const validationResult = entitlementIdentityStepSchema.safeParse({
            name: state.values.name,
            slug: state.values.slug,
            description: state.values.description,
            groupSlugs: state.values.groupSlugs,
            icon: state.values.icon,
          });
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

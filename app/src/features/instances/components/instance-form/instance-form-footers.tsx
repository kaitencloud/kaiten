import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { Instance } from '@/api-client';
import { useStackedFormDialogClose } from '@/functionals/stacked-form-dialog';
import { StepStackPrevious, useStepStack } from '@/functionals/step-stack';
import {
  instanceDetailsFormSchema,
  type InstanceFormValues,
  instanceLicenseFormSchema,
} from '../../utils/instance-form.shared';

type ValidatedStepNextButtonProps = {
  label: string;
  disabled: boolean;
};

const ValidatedStepNextButton = ({
  label,
  disabled,
}: ValidatedStepNextButtonProps) => {
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

export function InstanceDetailsStepFooter({ form }: { form: any }) {
  const { t } = useTranslation();
  // The first step has no Previous: its way out is Cancel, as in every other
  // form dialog.
  const requestClose = useStackedFormDialogClose();

  return (
    <>
      {requestClose ? (
        <Button type="button" variant="outline" onClick={requestClose}>
          {t('Common.cancel', 'Cancel')}
        </Button>
      ) : null}
      <form.Subscribe
        selector={(state: { values: InstanceFormValues }) => state}
      >
        {(state: { values: InstanceFormValues }) => {
          const validationResult = instanceDetailsFormSchema.safeParse({
            name: state.values.name,
            description: state.values.description,
            customerId: state.values.customerId,
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

export function InstanceLicenseStepFooter({ form }: { form: any }) {
  const { t } = useTranslation();

  return (
    <>
      <StepStackPreviousButton />
      <form.Subscribe
        selector={(state: { values: InstanceFormValues }) => state}
      >
        {(state: { values: InstanceFormValues }) => {
          const validationResult = instanceLicenseFormSchema.safeParse({
            licenseSlug: state.values.licenseSlug,
            licenseDate: state.values.licenseDate,
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

// The deployment step is last only when the organization declares no metadata
// field for instances -- otherwise the metadata step follows it and this one
// just advances. Whichever is last carries the submit button.
export function InstanceDeploymentStepFooter({
  form,
  formId,
  hasMetadataStep,
  instance,
}: {
  form: any;
  formId: string;
  hasMetadataStep: boolean;
  instance?: Instance;
}) {
  const { t } = useTranslation();

  return (
    <>
      <StepStackPreviousButton />
      {hasMetadataStep ? (
        <ValidatedStepNextButton
          label={t('Common.next', 'Next')}
          disabled={false}
        />
      ) : (
        <InstanceSubmitButton form={form} formId={formId} instance={instance} />
      )}
    </>
  );
}

export function InstanceMetadataStepFooter({
  form,
  formId,
  instance,
}: {
  form: any;
  formId: string;
  instance?: Instance;
}) {
  return (
    <>
      <StepStackPreviousButton />
      <InstanceSubmitButton form={form} formId={formId} instance={instance} />
    </>
  );
}

function InstanceSubmitButton({
  form,
  formId,
  instance,
}: {
  form: any;
  formId: string;
  instance?: Instance;
}) {
  const { t } = useTranslation();

  return (
    <form.SubmitButton
      form={formId}
      label={
        instance
          ? t('Pages.Customers.Instances.Mutation.Form.updateButton')
          : t('Pages.Customers.Instances.Mutation.Form.createButton')
      }
    />
  );
}

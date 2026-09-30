import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import type { FeatureFlag } from '@/api-client';
import { ProgressStepper } from '@/functionals/progress-stepper';
import { DefaultVariantForm } from './default-variant/default-variant-form';
import { GeneralForm } from './general-form';
import {
  type FeatureFlagFormApi,
  type FeatureFlagFormHeaderSubscribeState,
  type FeatureFlagFormTab,
  getFeatureFlagSubmitBlockers,
  getStepBlockers,
  SubmitBlockersTooltip,
  type TranslateFn,
} from './shared';
import { TargetingForm } from './targeting-form';
import { VariantsForm } from './variants-form';

type StepDefinition = {
  id: FeatureFlagFormTab;
  label: string;
};

type FeatureFlagCreateStepperProps = {
  form: FeatureFlagFormApi;
  featureFlag?: FeatureFlag;
  steps: StepDefinition[];
  submitLabel: string;
  t: TranslateFn;
};

export function FeatureFlagCreateStepper({
  featureFlag,
  form,
  steps,
  submitLabel,
  t,
}: FeatureFlagCreateStepperProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);

  const isLastStep = activeStep === steps.length - 1;
  const currentStepId = steps[activeStep].id;

  const goToStep = (index: number) => {
    if (index < 0 || index >= steps.length || index > furthestStep) {
      return;
    }

    setActiveStep(index);
  };

  const handleContinue = () => {
    const nextStep = Math.min(activeStep + 1, steps.length - 1);
    setActiveStep(nextStep);
    setFurthestStep((previous) => Math.max(previous, nextStep));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <ProgressStepper
        activeStep={activeStep}
        furthestStep={furthestStep}
        onStepChange={goToStep}
        steps={steps}
      />

      {/* The footer lives inside the scroll area, right under the step: on a
          short step it sits where the card ends instead of at the bottom of
          the viewport, and on a long step `sticky` keeps it in view. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StepContent
          featureFlag={featureFlag}
          form={form}
          step={currentStepId}
        />

        <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 border-t bg-app-background py-4">
          <Button
            disabled={activeStep === 0}
            onClick={() => goToStep(activeStep - 1)}
            type="button"
            variant="outline"
          >
            <ArrowLeft />
            {t('Pages.FeatureFlags.Mutation.Form.Buttons.back')}
          </Button>

          {isLastStep ? (
            <FinalSubmitButton form={form} submitLabel={submitLabel} t={t} />
          ) : (
            <NextStepButton
              form={form}
              onContinue={handleContinue}
              step={currentStepId}
              t={t}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StepContent({
  featureFlag,
  form,
  step,
}: {
  featureFlag?: FeatureFlag;
  form: FeatureFlagFormApi;
  step: FeatureFlagFormTab;
}) {
  switch (step) {
    case 'step1':
      return <GeneralForm featureFlag={featureFlag} form={form} />;
    case 'step2':
      return (
        <form.Subscribe selector={(state) => state.values.type}>
          {(type) => <VariantsForm form={form} variantType={type} />}
        </form.Subscribe>
      );
    case 'step3':
      return <DefaultVariantForm form={form} />;
    case 'step4':
      return <TargetingForm form={form} />;
  }
}

function NextStepButton({
  form,
  onContinue,
  step,
  t,
}: {
  form: FeatureFlagFormApi;
  onContinue: () => void;
  step: FeatureFlagFormTab;
  t: TranslateFn;
}) {
  return (
    <form.Subscribe selector={(state) => state.values}>
      {(values) => {
        const stepBlockers = getStepBlockers(step, values, t);

        if (stepBlockers.length === 0) {
          return (
            <Button onClick={onContinue} type="button">
              {t('Pages.FeatureFlags.Mutation.Form.Buttons.next')}
              <ArrowRight />
            </Button>
          );
        }

        return (
          <SubmitBlockersTooltip
            reasons={stepBlockers}
            title={t(
              'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.stepTitle',
            )}
          >
            <span className="inline-flex">
              <Button disabled type="button">
                {t('Pages.FeatureFlags.Mutation.Form.Buttons.next')}
                <ArrowRight />
              </Button>
            </span>
          </SubmitBlockersTooltip>
        );
      }}
    </form.Subscribe>
  );
}

function FinalSubmitButton({
  form,
  submitLabel,
  t,
}: {
  form: FeatureFlagFormApi;
  submitLabel: string;
  t: TranslateFn;
}) {
  return (
    <form.Subscribe<FeatureFlagFormHeaderSubscribeState>
      selector={(state) => ({
        disabled:
          state.isValidating ||
          !state.isValid ||
          !state.isDirty ||
          state.isSubmitting,
        isDirty: state.isDirty,
        isSubmitting: state.isSubmitting,
        isValid: state.isValid,
        isValidating: state.isValidating,
        values: state.values,
      })}
    >
      {({ disabled, isDirty, isSubmitting, isValid, isValidating, values }) => {
        const submitButton = (
          <span className="inline-flex">
            <Button disabled={disabled} type="submit">
              {isSubmitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Check />
              )}
              {submitLabel}
            </Button>
          </span>
        );

        if (!disabled) {
          return submitButton;
        }

        const submitBlockers = getFeatureFlagSubmitBlockers({
          isDirty,
          isEditMode: false,
          isSubmitting,
          isValid,
          isValidating,
          t,
          values,
        });

        return (
          <SubmitBlockersTooltip
            reasons={submitBlockers}
            title={t('Pages.FeatureFlags.Mutation.Form.SubmitBlockers.title')}
          >
            {submitButton}
          </SubmitBlockersTooltip>
        );
      }}
    </form.Subscribe>
  );
}

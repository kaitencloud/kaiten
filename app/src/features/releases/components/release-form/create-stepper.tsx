import { Button } from '@/components/ui/button';
import type { TFunction } from 'i18next';
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ProgressStepper } from '@/functionals/progress-stepper';
import {
  getReleaseSubmitBlockers,
  getStepBlockers,
  type ReleaseFormApi,
  type ReleaseFormHeaderSubscribeState,
  type ReleaseFormStep,
  SubmitBlockersTooltip,
} from './shared';

type StepDefinition = {
  id: ReleaseFormStep;
  label: string;
};

type ReleaseCreateStepperProps = {
  form: ReleaseFormApi;
  isLoading: boolean;
  renderStep: (step: ReleaseFormStep) => ReactNode;
  steps: StepDefinition[];
  submitLabel: string;
  t: TFunction;
};

export function ReleaseCreateStepper({
  form,
  isLoading,
  renderStep,
  steps,
  submitLabel,
  t,
}: ReleaseCreateStepperProps) {
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

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {renderStep(currentStepId)}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-app-background py-4">
        <Button
          disabled={activeStep === 0}
          onClick={() => goToStep(activeStep - 1)}
          type="button"
          variant="outline"
        >
          <ArrowLeft />
          {t('Pages.Releases.Deployments.Form.Buttons.back')}
        </Button>

        {isLastStep ? (
          <FinalSubmitButton
            form={form}
            isLoading={isLoading}
            submitLabel={submitLabel}
            t={t}
          />
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
  );
}

function NextStepButton({
  form,
  onContinue,
  step,
  t,
}: {
  form: ReleaseFormApi;
  onContinue: () => void;
  step: ReleaseFormStep;
  t: TFunction;
}) {
  return (
    <form.Subscribe selector={(state) => state.values}>
      {(values) => {
        const stepBlockers = getStepBlockers(step, values, t);

        if (stepBlockers.length === 0) {
          return (
            <Button onClick={onContinue} type="button">
              {t('Pages.Releases.Deployments.Form.Buttons.next')}
              <ArrowRight />
            </Button>
          );
        }

        return (
          <SubmitBlockersTooltip
            reasons={stepBlockers}
            title={t('Features.Releases.Form.SubmitBlockers.stepTitle')}
          >
            <span className="inline-flex">
              <Button disabled type="button">
                {t('Pages.Releases.Deployments.Form.Buttons.next')}
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
  isLoading,
  submitLabel,
  t,
}: {
  form: ReleaseFormApi;
  isLoading: boolean;
  submitLabel: string;
  t: TFunction;
}) {
  return (
    <form.Subscribe<ReleaseFormHeaderSubscribeState>
      selector={(state) => ({
        disabled:
          state.isValidating ||
          !state.isValid ||
          !state.isDirty ||
          state.isSubmitting ||
          isLoading,
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
              {isSubmitting || isLoading ? (
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

        const submitBlockers = getReleaseSubmitBlockers({
          isDirty,
          isLoading,
          isSubmitting,
          isValid,
          isValidating,
          t,
          values,
        });

        return (
          <SubmitBlockersTooltip
            reasons={submitBlockers}
            title={t('Features.Releases.Form.SubmitBlockers.title')}
          >
            {submitButton}
          </SubmitBlockersTooltip>
        );
      }}
    </form.Subscribe>
  );
}

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { StepNextButton } from '@/components/form/step-next-button';
import { focusFirstInvalidControl } from '@/components/form/use-submit-focus';
import {
  type FormRecovery,
  FormRecoveryAlert,
  FormRecoveryAnnouncer,
  FormRecoveryNotes,
  FormRecoverySubmitWarning,
  useFormRecovery,
  useFormRecoveryForm,
} from '@/functionals/form-recovery';
import { Page } from '@/functionals/page';
import { ProgressStepper } from '@/functionals/progress-stepper';
import { createFormSubmitHandler } from '@/hooks/form';
import {
  EntitlementIdentityFields,
  EntitlementTypeFields,
} from './entitlement-form-fields';
import {
  type EntitlementFormValues,
  entitlementIdentityStepSchema,
  getEntitlementFormDefaults,
  getIdentityStepValues,
} from './entitlement-form.shared';
import { entitlementRecovery } from './entitlement-recovery';
import { useEntitlementMutationForm } from './use-entitlement-mutation-form';

type EntitlementCreatePageProps = {
  onCancel: () => void;
  onSuccess: (entitlement: Entitlement) => void;
};

/**
 * New Entitlement as a full page, like New Feature Flag: a stepper over the
 * identity step, then the type configuration, with the actions pinned under
 * the step. Editing keeps its dialog.
 *
 * What is typed and not sent is kept on the device and offered back on the next
 * visit (`entitlementRecovery`). The door is opened here, outside the wizard:
 * resuming mounts the wizard again, with the restored values and step.
 */
export function EntitlementCreatePage(props: EntitlementCreatePageProps) {
  const recovery = useFormRecovery(entitlementRecovery, {
    // The page only serves the creation: the edit form is a dialog and keeps nothing.
    enabled: true,
    pristine: getEntitlementFormDefaults(),
  });
  const steps = useEntitlementCreateSteps();

  return (
    <>
      <FormRecoveryAnnouncer
        recovery={recovery}
        stepLabels={steps.map((step) => step.label)}
      />
      <EntitlementCreateWizard
        key={recovery.sessionKey}
        {...props}
        recovery={recovery}
        steps={steps}
      />
    </>
  );
}

type CreateStep = { id: string; label: string };

function useEntitlementCreateSteps(): CreateStep[] {
  const { t } = useTranslation();

  return [
    {
      id: 'identity',
      label: t(
        'Pages.Entitlements.Mutation.Form.Steps.identity',
        'Entitlement information',
      ),
    },
    {
      id: 'type',
      label: t(
        'Pages.Entitlements.Mutation.Form.Steps.type',
        'Type configuration',
      ),
    },
  ];
}

function EntitlementCreateWizard({
  onCancel,
  onSuccess,
  recovery,
  steps,
}: EntitlementCreatePageProps & {
  recovery: FormRecovery<EntitlementFormValues>;
  steps: CreateStep[];
}) {
  const { t } = useTranslation();
  const formId = useId();
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(
    recovery.restored?.stepIndex ?? 0,
  );
  const [furthestStep, setFurthestStep] = useState(
    recovery.restored?.furthestIndex ?? 0,
  );
  // How many times the stepper took the person back to the identity because it was broken.
  const [refusals, setRefusals] = useState(0);
  // A slug another entitlement holds is refused on its field, on the first step: the
  // wizard goes back to it and puts the focus there.
  const { form } = useEntitlementMutationForm(
    undefined,
    onSuccess,
    recovery,
    (field) => {
      if (field === 'slug') {
        setActiveStep(0);
        setRefusals((count) => count + 1);
      }
    },
  );
  const { focusRef } = useFormRecoveryForm(recovery, form, {
    stepIndex: activeStep,
    furthestIndex: furthestStep,
  });
  const isTypeStep = activeStep === 1;

  // A deliberate abandon, unlike leaving by a link: the entries are discarded, and a
  // toast offers to bring them back, which opens this page again on them.
  const cancel = () => {
    recovery.discard({
      undo: () => void navigate({ to: '/catalog/entitlements/new' }),
    });
    onCancel();
  };

  const goToStep = (index: number) => {
    if (index < 0 || index > furthestStep) {
      return;
    }
    // The identity can be broken after the second step was reached, and the stepper would
    // take the person back to a step that cannot be sent, with nothing to say why: it
    // shows what is wrong with the first step and puts the focus on it instead.
    const identity = entitlementIdentityStepSchema.safeParse(
      getIdentityStepValues(form.state.values),
    );
    if (index > activeStep && !identity.success) {
      setActiveStep(0);
      // The step draws the errors the submit found, then the effect below moves the focus.
      void form.handleSubmit().then(() => setRefusals((count) => count + 1));

      return;
    }
    setActiveStep(index);
  };

  useEffect(() => {
    if (refusals > 0) {
      focusFirstInvalidControl(document.getElementById(formId));
    }
  }, [formId, refusals]);

  const goToTypeStep = () => {
    setActiveStep(1);
    setFurthestStep(1);
  };

  return (
    <form
      id={formId}
      ref={focusRef}
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <form.AppForm>
        <Page className="h-full min-h-0 flex-1 overflow-hidden">
          <Page.Header className="sticky top-0 z-20 bg-app-background pb-4">
            <Page.Leading>
              <Page.Heading>
                <Page.Title>
                  {t('Pages.Entitlements.Mutation.titleNew')}
                </Page.Title>
              </Page.Heading>
            </Page.Leading>
          </Page.Header>

          <div className="flex min-h-0 flex-1 flex-col gap-6">
            <FormRecoveryAlert
              className="shrink-0"
              recovery={recovery}
              stepLabels={steps.map((step) => step.label)}
            >
              <EntitlementListLink />
            </FormRecoveryAlert>

            <ProgressStepper
              activeStep={activeStep}
              furthestStep={furthestStep}
              onStepChange={goToStep}
              steps={steps}
            />

            {/* As on the flag wizard, the actions sit in the scroll area under
                the step, and `sticky` keeps them in view on a long one. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Card>
                <CardHeader>
                  <CardTitle>{steps[activeStep].label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormRecoveryNotes className="mb-6" recovery={recovery} />
                  {isTypeStep ? (
                    <EntitlementTypeFields className="space-y-6" form={form} />
                  ) : (
                    <EntitlementIdentityFields
                      className="space-y-6"
                      form={form}
                    />
                  )}
                </CardContent>
              </Card>

              <EntitlementCreateFooter
                form={form}
                isTypeStep={isTypeStep}
                onBack={() => setActiveStep(0)}
                onCancel={cancel}
                onNext={goToTypeStep}
                recovery={recovery}
              />
            </div>
          </div>
        </Page>
      </form.AppForm>
    </form>
  );
}

function EntitlementListLink() {
  const { t } = useTranslation();

  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<Link to="/catalog/entitlements" />}
    >
      {t('Pages.Entitlements.Mutation.Form.Recovery.viewList')}
    </Button>
  );
}

function EntitlementCreateFooter({
  form,
  isTypeStep,
  onBack,
  onCancel,
  onNext,
  recovery,
}: {
  form: any;
  isTypeStep: boolean;
  onBack: () => void;
  onCancel: () => void;
  onNext: () => void;
  recovery: FormRecovery<EntitlementFormValues>;
}) {
  const { t } = useTranslation();

  return (
    <div className="sticky bottom-0 mt-6 border-t bg-app-background py-4">
      <div className="flex items-center justify-between gap-3">
        {isTypeStep ? (
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft />
            {t('Common.previous', 'Previous')}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('Common.cancel')}
          </Button>
        )}
        {isTypeStep ? (
          <form.SubmitButton
            label={t('Pages.Entitlements.Mutation.Form.createButton')}
          />
        ) : (
          <IdentityStepNextButton form={form} onNext={onNext} />
        )}
      </div>
      <FormRecoverySubmitWarning className="mt-4" recovery={recovery}>
        <EntitlementListLink />
      </FormRecoverySubmitWarning>
    </div>
  );
}

// The type step opens once the identity step would pass on its own, as in the
// dialog wizard.
function IdentityStepNextButton({
  form,
  onNext,
}: {
  form: any;
  onNext: () => void;
}) {
  const { t } = useTranslation();

  return (
    <form.Subscribe
      selector={(state: { values: EntitlementFormValues }) => state.values}
    >
      {(values: EntitlementFormValues) => {
        const { success } = entitlementIdentityStepSchema.safeParse(
          getIdentityStepValues(values),
        );

        return (
          <StepNextButton disabled={!success} onClick={onNext}>
            {t('Common.next', 'Next')}
            <ArrowRight />
          </StepNextButton>
        );
      }}
    </form.Subscribe>
  );
}

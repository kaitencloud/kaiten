import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
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
} from './entitlement-form.shared';
import { useEntitlementMutationForm } from './use-entitlement-mutation-form';

type EntitlementCreatePageProps = {
  onCancel: () => void;
  onSuccess: (entitlement: Entitlement) => void;
};

/**
 * New Entitlement as a full page, like New Feature Flag: a stepper over the
 * identity step, then the type configuration, with the actions pinned under
 * the step. Editing keeps its dialog.
 */
export function EntitlementCreatePage({
  onCancel,
  onSuccess,
}: EntitlementCreatePageProps) {
  const { t } = useTranslation();
  const formId = useId();
  const form = useEntitlementMutationForm(undefined, onSuccess);
  const [activeStep, setActiveStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const isTypeStep = activeStep === 1;
  const steps = [
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

  const goToStep = (index: number) => {
    if (index >= 0 && index <= furthestStep) {
      setActiveStep(index);
    }
  };

  const goToTypeStep = () => {
    setActiveStep(1);
    setFurthestStep(1);
  };

  return (
    <form
      id={formId}
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
                onCancel={onCancel}
                onNext={goToTypeStep}
              />
            </div>
          </div>
        </Page>
      </form.AppForm>
    </form>
  );
}

function EntitlementCreateFooter({
  form,
  isTypeStep,
  onBack,
  onCancel,
  onNext,
}: {
  form: any;
  isTypeStep: boolean;
  onBack: () => void;
  onCancel: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 border-t bg-app-background py-4">
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
        const { success } = entitlementIdentityStepSchema.safeParse({
          name: values.name,
          slug: values.slug,
          description: values.description,
          groupSlugs: values.groupSlugs,
          icon: values.icon,
        });

        return (
          <Button type="button" disabled={!success} onClick={onNext}>
            {t('Common.next', 'Next')}
            <ArrowRight />
          </Button>
        );
      }}
    </form.Subscribe>
  );
}

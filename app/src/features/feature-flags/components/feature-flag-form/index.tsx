import { Button } from '@/components/ui/button';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page } from '@/functionals/page';
import { createFormSubmitHandler } from '@/hooks/form';
import { useFeatureFlagForm } from '../../hooks/use-feature-flag-form';
import type { FeatureFlagFormProps } from '../../types';
import { FeatureFlagCreateStepper } from './create-stepper';
import { DefaultVariantForm } from './default-variant/default-variant-form';
import { FeatureFlagEnabledSwitch } from './feature-flag-enabled-switch';
import { GeneralForm } from './general-form';
import {
  FEATURE_FLAG_FORM_STEPS,
  type FeatureFlagFormApi,
  type FeatureFlagFormHeaderSubscribeState,
  type FeatureFlagFormTab,
  getFeatureFlagSubmitBlockers,
  SubmitBlockersTooltip,
  type TranslateFn,
} from './shared';
import { TargetingForm } from './targeting-form';
import { VariantsForm } from './variants-form';

function FeatureFlagFormHeaderActions({
  form,
  handleCancel,
  isEditMode,
  submitLabel,
  t,
}: {
  form: FeatureFlagFormApi;
  handleCancel: () => void;
  isEditMode: boolean;
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
        const submitBlockers = disabled
          ? getFeatureFlagSubmitBlockers({
              isDirty,
              isEditMode,
              isSubmitting,
              isValid,
              isValidating,
              t,
              values,
            })
          : [];
        const submitBlockersTitle = t(
          'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.title',
        );
        const disabledSubmitButton = (
          <span className="inline-flex">
            <Button type="submit" disabled>
              {isSubmitting ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {submitLabel}
            </Button>
          </span>
        );

        return (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={handleCancel}>
              {t('Common.cancel')}
            </Button>

            {disabled ? (
              <SubmitBlockersTooltip
                reasons={submitBlockers}
                title={submitBlockersTitle}
              >
                {disabledSubmitButton}
              </SubmitBlockersTooltip>
            ) : (
              <Button type="submit">{submitLabel}</Button>
            )}
          </div>
        );
      }}
    </form.Subscribe>
  );
}

export const FeatureFlagForm = ({ featureFlag }: FeatureFlagFormProps) => {
  const { t } = useTranslation();
  const isEditMode = !!featureFlag;
  const [activeTab, setActiveTab] = useState<FeatureFlagFormTab>('step1');
  const { dialog, form, handleCancel } = useFeatureFlagForm({ featureFlag });
  const steps = FEATURE_FLAG_FORM_STEPS.map((step) => ({
    id: step,
    label: t(`Pages.FeatureFlags.Mutation.Form.Steps.${step}`),
  }));
  const formTitle = isEditMode
    ? t('Pages.FeatureFlags.Mutation.titleUpdate')
    : t('Pages.FeatureFlags.Mutation.titleNew');
  const submitLabel = isEditMode
    ? t('Pages.FeatureFlags.Mutation.Form.Buttons.update')
    : t('Pages.FeatureFlags.Mutation.Form.Buttons.create');

  return (
    <>
      <form
        onSubmit={createFormSubmitHandler(form.handleSubmit)}
        className="flex h-full min-h-0 flex-col overflow-hidden"
      >
        <form.AppForm>
          <Page className="h-full min-h-0 flex-1 overflow-hidden">
            <Page.Header className="sticky top-0 z-20 bg-app-background pb-4">
              <Page.Leading>
                <Page.Heading>
                  <Page.Title>{formTitle}</Page.Title>
                </Page.Heading>
              </Page.Leading>
              <Page.Actions>
                <div className="flex items-center gap-4">
                  <form.Subscribe selector={(state) => state.values.enabled}>
                    {(enabled) => (
                      <FeatureFlagEnabledSwitch
                        checked={!!enabled}
                        onCheckedChange={(checked) =>
                          form.setFieldValue('enabled', checked)
                        }
                      />
                    )}
                  </form.Subscribe>

                  {isEditMode ? (
                    <FeatureFlagFormHeaderActions
                      form={form}
                      handleCancel={handleCancel}
                      isEditMode={isEditMode}
                      submitLabel={submitLabel}
                      t={t}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancel}
                    >
                      {t('Common.cancel')}
                    </Button>
                  )}
                </div>
              </Page.Actions>
            </Page.Header>

            {isEditMode ? (
              <Tabs
                value={activeTab}
                onValueChange={(value) =>
                  setActiveTab(value as FeatureFlagFormTab)
                }
                className="min-h-0 flex-1 gap-0"
              >
                <TabsList
                  variant="line"
                  className="w-full justify-start overflow-x-auto rounded-none"
                >
                  {steps.map((step) => (
                    <TabsTrigger key={step.id} value={step.id}>
                      {step.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent
                  value="step1"
                  className="min-h-0 flex-1 overflow-y-auto pt-6 pb-6"
                >
                  <GeneralForm form={form} featureFlag={featureFlag} />
                </TabsContent>

                <TabsContent
                  value="step2"
                  className="min-h-0 flex-1 overflow-y-auto pt-6 pb-6"
                >
                  <VariantsForm
                    form={form}
                    variantType={form.state.values.type}
                  />
                </TabsContent>

                <TabsContent
                  value="step3"
                  className="min-h-0 flex-1 overflow-y-auto pt-6 pb-6"
                >
                  <DefaultVariantForm form={form} />
                </TabsContent>

                <TabsContent
                  value="step4"
                  className="min-h-0 flex-1 overflow-y-auto pt-6 pb-6"
                >
                  <TargetingForm form={form} />
                </TabsContent>
              </Tabs>
            ) : (
              <FeatureFlagCreateStepper
                featureFlag={featureFlag}
                form={form}
                steps={steps}
                submitLabel={submitLabel}
                t={t}
              />
            )}
          </Page>
        </form.AppForm>
      </form>

      <AlertDialog open={dialog.open} onOpenChange={dialog.onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Pages.FeatureFlags.Mutation.Form.TypeChangeDialog.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Pages.FeatureFlags.Mutation.Form.TypeChangeDialog.description',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={dialog.onCancel}>
              {t('Pages.FeatureFlags.Mutation.Form.TypeChangeDialog.cancel')}
            </AlertDialogCancel>
            <AlertDialogClose
              render={
                <AlertDialogAction onClick={dialog.onConfirm}>
                  {t(
                    'Pages.FeatureFlags.Mutation.Form.TypeChangeDialog.confirm',
                  )}
                </AlertDialogAction>
              }
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

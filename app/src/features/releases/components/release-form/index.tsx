import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Component } from '@/api-client';
import { allComponentsOptions } from '@/lib/api/all-pages-query-options';
import { releaseManagementOverviewQueryOptions } from '@/domains/release-management';
import { Page } from '@/functionals/page';
import { createFormSubmitHandler } from '@/hooks/form';
import { useReleaseBaseChangeController } from '../../hooks/use-release-base-change-controller';
import { useReleaseForm } from '../../hooks/use-release-form';
import type { ReleaseFormValues } from '../../schemas/release.schema';
import type { ReleaseManagementOverviewRelease } from '../../types';
import { ReleaseCreateStepper } from './create-stepper';
import { ReleaseBaseChangeConfirmationDialog } from './dialogs/release-base-change-confirmation-dialog';
import { ReleaseFormAddCatalogDialog } from './release-form-add-catalog-dialog';
import { ReleaseFormBaseSelector } from './release-form-base-selector';
import { ReleaseFormComponentDialogHost } from './release-form-component-dialog-host';
import { ReleaseFormComponentsCard } from './release-form-components-card';
import { ReleaseFormInformationCard } from './release-form-information-card';
import { RELEASE_FORM_STEPS, type ReleaseFormStep } from './shared';
import { useReleaseFormComponentDialog } from './use-release-form-component-dialog';

export function ReleaseForm() {
  const { t } = useTranslation();
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);

  const { data: componentsQueryData } = useSuspenseQuery(
    allComponentsOptions(),
  );
  const availableComponents: Component[] = componentsQueryData?.items ?? [];
  const { data: releases } = useSuspenseQuery(
    releaseManagementOverviewQueryOptions,
  );
  const { form, handleCancel, isLoading } = useReleaseForm({
    releases: releases ?? [],
  });
  const submitLabel = t('Features.Releases.Form.createRelease');

  return (
    <form
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <form.AppForm>
        <form.Subscribe<ReleaseFormValues> selector={(state) => state.values}>
          {(values) => (
            <ReleaseFormContent
              availableComponents={availableComponents}
              catalogDialogOpen={catalogDialogOpen}
              form={form}
              isLoading={isLoading}
              onCancel={handleCancel}
              onCatalogDialogOpenChange={setCatalogDialogOpen}
              releases={releases ?? []}
              submitLabel={submitLabel}
              t={t}
              values={values}
            />
          )}
        </form.Subscribe>
      </form.AppForm>
    </form>
  );
}

type ReleaseFormContentProps = {
  availableComponents: Component[];
  catalogDialogOpen: boolean;
  form: ReturnType<typeof useReleaseForm>['form'];
  isLoading: boolean;
  onCancel: () => void;
  onCatalogDialogOpenChange: (open: boolean) => void;
  releases: ReleaseManagementOverviewRelease[];
  submitLabel: string;
  t: TFunction;
  values: ReleaseFormValues;
};

function ReleaseFormContent({
  availableComponents,
  catalogDialogOpen,
  form,
  isLoading,
  onCancel,
  onCatalogDialogOpenChange,
  releases,
  submitLabel,
  t,
  values,
}: ReleaseFormContentProps) {
  const {
    confirmPendingBaseChange,
    pendingBaseChange,
    requestCreationModeChange,
    requestPreviousReleaseChange,
    resetPendingBaseChange,
  } = useReleaseBaseChangeController({ form, values });

  const previousRelease = useMemo(
    () =>
      values.creationMode === 'existing' && values.previousReleaseId
        ? releases.find((r) => r.id === values.previousReleaseId)
        : undefined,
    [releases, values.creationMode, values.previousReleaseId],
  );

  const excludedComponentIds = useMemo(() => {
    const ids = new Set(values.selectedComponentIds);
    for (const component of previousRelease?.components ?? []) {
      ids.add(component.id);
    }
    return [...ids];
  }, [previousRelease, values.selectedComponentIds]);

  const handleAddFromCatalog = useCallback(
    (componentIds: string[]) => {
      form.setFieldValue('selectedComponentIds', [
        ...values.selectedComponentIds,
        ...componentIds,
      ]);
    },
    [form, values.selectedComponentIds],
  );

  const {
    componentDialog,
    handleComponentPersisted,
    handleOpenComponentEdit,
    setComponentDialog,
  } = useReleaseFormComponentDialog({
    availableComponents,
    form,
    previousRelease,
    t,
    values,
  });

  // The base step only makes sense when there is at least one release to
  // inherit from. Otherwise the form starts directly on the information step.
  const hasExistingReleases = releases.length > 0;
  const steps = RELEASE_FORM_STEPS.flatMap((step) =>
    step === 'base' && !hasExistingReleases
      ? []
      : [
          {
            id: step,
            label: t(`Pages.Releases.Deployments.Form.Steps.${step}`),
          },
        ],
  );

  const baseBadgeLabel = previousRelease
    ? t('Pages.Releases.Deployments.Form.basedOn', {
        version: previousRelease.version,
      })
    : t('Pages.Releases.Deployments.Form.modes.scratch.title');

  const renderStep = (step: ReleaseFormStep): ReactNode => {
    switch (step) {
      case 'base':
        return (
          <ReleaseFormBaseSelector
            onCreationModeChange={requestCreationModeChange}
            onPreviousReleaseChange={requestPreviousReleaseChange}
            releases={releases}
            t={t}
            values={values}
          />
        );
      case 'metadata':
        return <ReleaseFormInformationCard form={form} t={t} />;
      case 'components':
        return (
          <ReleaseFormComponentsCard
            availableComponents={availableComponents}
            form={form}
            onOpenAddCatalogDialog={() => onCatalogDialogOpenChange(true)}
            onOpenCreateDialog={() => setComponentDialog({ mode: 'create' })}
            onOpenEditComponent={handleOpenComponentEdit}
            previousRelease={previousRelease}
            t={t}
            values={values}
          />
        );
    }
  };

  return (
    <>
      <ReleaseBaseChangeConfirmationDialog
        cancelLabel={t('Common.cancel')}
        confirmLabel={t(
          'Pages.Releases.Deployments.Form.changeBaseDialog.confirm',
        )}
        description={t(
          'Pages.Releases.Deployments.Form.changeBaseDialog.description',
        )}
        onCancel={resetPendingBaseChange}
        onConfirm={confirmPendingBaseChange}
        open={pendingBaseChange !== null}
        title={t('Pages.Releases.Deployments.Form.changeBaseDialog.title')}
      />

      <Page className="h-full min-h-0 flex-1 overflow-hidden">
        <Page.Header className="sticky top-0 z-20 bg-app-background pb-4">
          <Page.Leading>
            <Page.Heading>
              <Page.Title className="flex items-center gap-3">
                {t('Pages.Releases.Deployments.Form.title')}
                {hasExistingReleases && values.creationMode !== '' ? (
                  <Badge variant="secondary">{baseBadgeLabel}</Badge>
                ) : null}
              </Page.Title>
            </Page.Heading>
          </Page.Leading>
          <Page.Actions>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('Common.cancel')}
            </Button>
          </Page.Actions>
        </Page.Header>

        <ReleaseCreateStepper
          form={form}
          isLoading={isLoading}
          renderStep={renderStep}
          steps={steps}
          submitLabel={submitLabel}
          t={t}
        />
      </Page>

      <ReleaseFormAddCatalogDialog
        availableComponents={availableComponents}
        excludedComponentIds={excludedComponentIds}
        onAdd={handleAddFromCatalog}
        onOpenChange={onCatalogDialogOpenChange}
        open={catalogDialogOpen}
      />
      <ReleaseFormComponentDialogHost
        componentDialog={componentDialog}
        onOpenChange={(open) => {
          if (!open) setComponentDialog(null);
        }}
        onSuccess={handleComponentPersisted}
      />
    </>
  );
}

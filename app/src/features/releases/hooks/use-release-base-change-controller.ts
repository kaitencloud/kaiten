import { useState } from 'react';
import type { ReleaseFormValues } from '../schemas/release.schema';
import type { ReleaseCreationMode } from '../types';
import type { useReleaseForm } from './use-release-form';

type ReleaseFormApi = ReturnType<typeof useReleaseForm>['form'];

type PendingBaseChange =
  | { kind: 'creation-mode'; nextMode: ReleaseCreationMode | '' }
  | { kind: 'previous-release'; nextPreviousReleaseId: string };

type UseReleaseBaseChangeControllerProps = {
  form: ReleaseFormApi;
  values: ReleaseFormValues;
};

function applyPendingBaseChange(
  change: PendingBaseChange,
  form: ReleaseFormApi,
) {
  form.setFieldValue('componentPatches', []);
  form.setFieldValue('selectedComponentIds', []);

  if (change.kind === 'creation-mode') {
    form.setFieldValue('creationMode', change.nextMode);

    if (change.nextMode !== 'existing') {
      form.setFieldValue('previousReleaseId', '');
    }

    return;
  }

  form.setFieldValue('creationMode', 'existing');
  form.setFieldValue('previousReleaseId', change.nextPreviousReleaseId);
}

export function useReleaseBaseChangeController({
  form,
  values,
}: UseReleaseBaseChangeControllerProps) {
  const [pendingBaseChange, setPendingBaseChange] =
    useState<PendingBaseChange | null>(null);
  const hasComponentChanges =
    values.componentPatches.length > 0 ||
    values.selectedComponentIds.length > 0;

  const requestCreationModeChange = (nextMode: ReleaseCreationMode) => {
    if (values.creationMode === nextMode) {
      return;
    }

    if (hasComponentChanges) {
      setPendingBaseChange({ kind: 'creation-mode', nextMode });
      return;
    }

    applyPendingBaseChange({ kind: 'creation-mode', nextMode }, form);
  };

  const requestBaseSelectionReset = () => {
    if (values.creationMode === '' && values.previousReleaseId === '') {
      return;
    }

    if (hasComponentChanges) {
      setPendingBaseChange({ kind: 'creation-mode', nextMode: '' });
      return;
    }

    applyPendingBaseChange({ kind: 'creation-mode', nextMode: '' }, form);
  };

  const requestPreviousReleaseChange = (nextPreviousReleaseId: string) => {
    if (values.previousReleaseId === nextPreviousReleaseId) {
      return;
    }

    if (hasComponentChanges) {
      setPendingBaseChange({
        kind: 'previous-release',
        nextPreviousReleaseId,
      });
      return;
    }

    applyPendingBaseChange(
      { kind: 'previous-release', nextPreviousReleaseId },
      form,
    );
  };

  const confirmPendingBaseChange = () => {
    if (!pendingBaseChange) {
      return;
    }

    applyPendingBaseChange(pendingBaseChange, form);
    setPendingBaseChange(null);
  };

  return {
    confirmPendingBaseChange,
    pendingBaseChange,
    requestBaseSelectionReset,
    requestCreationModeChange,
    requestPreviousReleaseChange,
    resetPendingBaseChange: () => setPendingBaseChange(null),
  };
}

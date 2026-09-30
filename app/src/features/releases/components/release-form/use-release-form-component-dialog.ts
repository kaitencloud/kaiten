import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Component } from '@/api-client';
import type { useReleaseForm } from '../../hooks/use-release-form';
import type { ReleaseFormValues } from '../../schemas/release.schema';
import type { ReleaseManagementOverviewRelease } from '../../types';
import {
  getAddedComponentDrafts,
  replaceAddedComponentDrafts,
  revertInheritedComponentChanges,
  syncInheritedPatchAfterFork,
} from './component-changes/release-component-changes.utils';
import type { ReleaseComponentDialogState } from './release-form-component-dialog.types';
import { tryOpenComponentEditDialog } from './release-form-component-edit-open';
import type { ComponentRow } from './release-form-components-columns';

export type { ReleaseComponentDialogState } from './release-form-component-dialog.types';

type FormApi = ReturnType<typeof useReleaseForm>['form'];

function findInheritedComponent(
  previousRelease: ReleaseManagementOverviewRelease | undefined,
  rowId: string,
) {
  const componentId = rowId.replace('inherited-', '');
  return (previousRelease?.components ?? []).find((c) => c.id === componentId);
}

type UseReleaseFormComponentDialogArgs = {
  availableComponents: Component[];
  form: FormApi;
  previousRelease: ReleaseManagementOverviewRelease | undefined;
  t: TFunction;
  values: ReleaseFormValues;
};

export function useReleaseFormComponentDialog({
  availableComponents,
  form,
  previousRelease,
  t,
  values,
}: UseReleaseFormComponentDialogArgs) {
  const [componentDialog, setComponentDialog] =
    useState<ReleaseComponentDialogState | null>(null);
  // The callbacks below memoize on `[form]` so they keep a stable identity across
  // keystrokes; these refs are what carries the current state into them. Written
  // after commit, read only from an event handler.
  const componentDialogRef = useRef<ReleaseComponentDialogState | null>(null);
  const valuesRef = useRef(values);
  useEffect(() => {
    componentDialogRef.current = componentDialog;
    valuesRef.current = values;
  }, [componentDialog, values]);

  const handleComponentPersisted = useCallback(
    (component: Component) => {
      const v = valuesRef.current;
      const dialog = componentDialogRef.current;
      if (!dialog) return;

      if (dialog.mode === 'create') {
        if (dialog.replaceAddedPatchIndex !== undefined) {
          const idx = dialog.replaceAddedPatchIndex;
          const drafts = getAddedComponentDrafts(v.componentPatches);
          form.setFieldValue(
            'componentPatches',
            replaceAddedComponentDrafts(
              v.componentPatches,
              drafts.filter((_, i) => i !== idx),
            ),
          );
        }
        form.setFieldValue('selectedComponentIds', [
          ...v.selectedComponentIds,
          component.id,
        ]);
      } else {
        const { target } = dialog;
        if (target.kind === 'catalog') {
          form.setFieldValue(
            'selectedComponentIds',
            v.selectedComponentIds.map((id) =>
              id === target.oldComponentId ? component.id : id,
            ),
          );
        } else if (target.kind === 'added') {
          const drafts = getAddedComponentDrafts(v.componentPatches);
          form.setFieldValue(
            'componentPatches',
            replaceAddedComponentDrafts(
              v.componentPatches,
              drafts.filter((_, i) => i !== target.patchIndex),
            ),
          );
          form.setFieldValue('selectedComponentIds', [
            ...v.selectedComponentIds,
            component.id,
          ]);
        } else {
          form.setFieldValue(
            'componentPatches',
            syncInheritedPatchAfterFork(
              v.componentPatches,
              target.component,
              component,
            ),
          );
        }
      }

      setComponentDialog(null);
    },
    [form],
  );

  const handleOpenComponentEdit = useCallback(
    (row: ComponentRow) => {
      const v = valuesRef.current;

      if (row.source === 'inherited' && row.status === 'removed') {
        const component = findInheritedComponent(previousRelease, row.id);
        if (component) {
          form.setFieldValue(
            'componentPatches',
            revertInheritedComponentChanges(v.componentPatches, component),
          );
        }
        return;
      }

      const result = tryOpenComponentEditDialog({
        availableComponents,
        previousRelease,
        row,
        values: v,
      });

      if (result.kind === 'missing-slug') {
        toast.error(
          t('Pages.Releases.Deployments.Form.componentsCard.missingSlug'),
        );
        return;
      }

      if (result.kind === 'dialog') {
        setComponentDialog(result.state);
      }
    },
    [availableComponents, form, previousRelease, t],
  );

  return {
    componentDialog,
    handleComponentPersisted,
    handleOpenComponentEdit,
    setComponentDialog,
  };
}

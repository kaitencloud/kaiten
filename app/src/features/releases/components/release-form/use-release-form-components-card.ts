import { useCallback, useMemo } from 'react';
import type { Component } from '@/api-client';
import type { useReleaseForm } from '../../hooks/use-release-form';
import type { ReleaseFormValues } from '../../schemas/release.schema';
import type {
  ReleaseManagementOverviewComponent,
  ReleaseManagementOverviewRelease,
} from '../../types';
import {
  getAddedComponentDrafts,
  replaceAddedComponentDrafts,
  revertInheritedComponentChanges,
  upsertInheritedComponentRemoval,
} from './component-changes/release-component-changes.utils';
import {
  buildComponentRows,
  type ComponentRow,
} from './release-form-components-columns';

type FormApi = ReturnType<typeof useReleaseForm>['form'];

function findInheritedComponent(
  previousRelease: ReleaseManagementOverviewRelease | undefined,
  rowId: string,
): ReleaseManagementOverviewComponent | undefined {
  const componentId = rowId.replace('inherited-', '');
  return (previousRelease?.components ?? []).find((c) => c.id === componentId);
}

function deleteRow(
  row: ComponentRow,
  form: FormApi,
  values: ReleaseFormValues,
  previousRelease: ReleaseManagementOverviewRelease | undefined,
) {
  if (row.source === 'inherited') {
    const component = findInheritedComponent(previousRelease, row.id);
    if (!component) return;
    const updater =
      row.status === 'removed'
        ? revertInheritedComponentChanges
        : upsertInheritedComponentRemoval;
    form.setFieldValue(
      'componentPatches',
      updater(values.componentPatches, component),
    );
    return;
  }
  if (row.source === 'catalog') {
    const componentId = row.id.replace('catalog-', '');
    form.setFieldValue(
      'selectedComponentIds',
      values.selectedComponentIds.filter((id) => id !== componentId),
    );
    return;
  }
  if (row.source === 'added') {
    const idx = Number(row.id.replace('added-', ''));
    const drafts = getAddedComponentDrafts(values.componentPatches);
    form.setFieldValue(
      'componentPatches',
      replaceAddedComponentDrafts(
        values.componentPatches,
        drafts.filter((_, i) => i !== idx),
      ),
    );
  }
}

type UseReleaseFormComponentsCardProps = {
  availableComponents: Component[];
  form: FormApi;
  previousRelease: ReleaseManagementOverviewRelease | undefined;
  values: ReleaseFormValues;
};

export function useReleaseFormComponentsCard({
  availableComponents,
  form,
  previousRelease,
  values,
}: UseReleaseFormComponentsCardProps) {
  const rows = useMemo(
    () => buildComponentRows(values, previousRelease, availableComponents),
    [values, previousRelease, availableComponents],
  );

  const handleDelete = useCallback(
    (row: ComponentRow) => {
      deleteRow(row, form, values, previousRelease);
    },
    [form, previousRelease, values],
  );

  return {
    handleDelete,
    rows,
  };
}

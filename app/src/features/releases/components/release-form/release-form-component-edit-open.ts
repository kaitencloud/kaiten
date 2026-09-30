import type { Component } from '@/api-client';
import type { ReleaseFormValues } from '../../schemas/release.schema';
import type { ReleaseManagementOverviewRelease } from '../../types';
import {
  getAddedComponentDrafts,
  getInheritedComponentPatch,
} from './component-changes/release-component-changes.utils';
import type { ReleaseComponentDialogState } from './release-form-component-dialog.types';
import type { ComponentRow } from './release-form-components-columns';

export type TryOpenComponentEditResult =
  | { kind: 'dialog'; state: ReleaseComponentDialogState }
  | { kind: 'missing-slug' }
  | { kind: 'noop' };

export function tryOpenComponentEditDialog({
  availableComponents,
  previousRelease,
  row,
  values,
}: {
  availableComponents: Component[];
  previousRelease: ReleaseManagementOverviewRelease | undefined;
  row: ComponentRow;
  values: ReleaseFormValues;
}): TryOpenComponentEditResult {
  if (row.source === 'catalog') {
    const id = row.id.replace('catalog-', '');
    const c = availableComponents.find((x) => x.id === id);
    if (!c?.slug?.trim()) {
      return { kind: 'missing-slug' };
    }
    return {
      kind: 'dialog',
      state: {
        mode: 'edit',
        componentSlug: c.slug,
        initialValues: {
          name: row.name,
          version: row.version,
          description: row.description,
        },
        target: { kind: 'catalog', oldComponentId: id },
      },
    };
  }

  if (row.source === 'added') {
    const idx = Number(row.id.replace('added-', ''));
    const drafts = getAddedComponentDrafts(values.componentPatches);
    const draft = drafts[idx];
    if (!draft) return { kind: 'noop' };
    const slug = draft.slug?.trim();
    if (slug) {
      return {
        kind: 'dialog',
        state: {
          mode: 'edit',
          componentSlug: slug,
          initialValues: {
            name: draft.name,
            version: draft.version,
            description: draft.description ?? '',
          },
          target: { kind: 'added', patchIndex: idx },
        },
      };
    }
    return {
      kind: 'dialog',
      state: {
        mode: 'create',
        replaceAddedPatchIndex: idx,
        initialValues: {
          name: draft.name,
          version: draft.version,
          description: draft.description ?? '',
        },
      },
    };
  }

  if (row.source === 'inherited') {
    const componentId = row.id.replace('inherited-', '');
    const component = previousRelease?.components?.find(
      (c) => c.id === componentId,
    );
    if (!component) return { kind: 'noop' };
    const patch = getInheritedComponentPatch(
      values.componentPatches,
      component,
    );
    const slug = patch?.slug?.trim() || component.slug;
    if (!slug) {
      return { kind: 'missing-slug' };
    }
    return {
      kind: 'dialog',
      state: {
        mode: 'edit',
        componentSlug: slug,
        initialValues: {
          name: row.name,
          version: row.version,
          description: row.description,
        },
        target: { kind: 'inherited', component },
      },
    };
  }

  return { kind: 'noop' };
}

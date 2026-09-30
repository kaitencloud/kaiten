import type { Component } from '@/api-client';
import {
  emptyReleaseComponentPatch,
  type ReleaseFormValues,
} from '../../../schemas/release.schema';
import type { ReleaseManagementOverviewComponent } from '../../../types';

export type ReleaseComponentPatch =
  ReleaseFormValues['componentPatches'][number];
export type AddedReleaseComponentDraft = ReleaseComponentPatch & {
  op: 'add';
};

export type InheritedReleaseComponentStatus =
  | 'edited'
  | 'removed'
  | 'unchanged';

export type InheritedReleaseComponentViewModel = {
  component: ReleaseManagementOverviewComponent;
  patch?: ReleaseComponentPatch;
  status: InheritedReleaseComponentStatus;
};

export type InheritedReleaseComponentDraft = {
  description: string;
  name: string;
  version: string;
};

type EditableInheritedComponentField = 'description' | 'name' | 'version';

function matchesInheritedComponent(
  patch: ReleaseComponentPatch,
  component: ReleaseManagementOverviewComponent,
) {
  return (
    patch.componentId === component.id ||
    (patch.componentId === '' && patch.componentSlug === component.slug)
  );
}

function splitPatchesByAddOperation(patches: ReleaseComponentPatch[]) {
  const inheritedComponentPatches: ReleaseComponentPatch[] = [];
  const addedComponentPatches: ReleaseComponentPatch[] = [];

  for (const patch of patches) {
    if (patch.op === 'add') {
      addedComponentPatches.push(patch);
      continue;
    }

    inheritedComponentPatches.push(patch);
  }

  return { addedComponentPatches, inheritedComponentPatches };
}

function getComponentFieldValue(
  component: ReleaseManagementOverviewComponent,
  field: EditableInheritedComponentField,
) {
  if (field === 'description') {
    return component.description ?? '';
  }

  return component[field] ?? '';
}

function withInheritedPatchOrdering(
  patches: ReleaseComponentPatch[],
  nextInheritedPatch: ReleaseComponentPatch | null,
  component: ReleaseManagementOverviewComponent,
) {
  const { addedComponentPatches, inheritedComponentPatches } =
    splitPatchesByAddOperation(patches);
  const nextInheritedPatches = inheritedComponentPatches.filter(
    (patch) => !matchesInheritedComponent(patch, component),
  );

  if (nextInheritedPatch) {
    nextInheritedPatches.push(nextInheritedPatch);
  }

  return [...nextInheritedPatches, ...addedComponentPatches];
}

export function getInheritedComponentPatch(
  patches: ReleaseComponentPatch[],
  component: ReleaseManagementOverviewComponent,
) {
  return patches.find(
    (patch) =>
      patch.op !== 'add' && matchesInheritedComponent(patch, component),
  );
}

export function getInheritedComponentViewModels(
  components: ReleaseManagementOverviewComponent[],
  patches: ReleaseComponentPatch[],
): InheritedReleaseComponentViewModel[] {
  return components.map((component) => {
    const patch = getInheritedComponentPatch(patches, component);

    if (!patch) {
      return {
        component,
        status: 'unchanged',
      };
    }

    return {
      component,
      patch,
      status: patch.op === 'remove' ? 'removed' : 'edited',
    };
  });
}

export function getInheritedComponentDraft(
  component: ReleaseManagementOverviewComponent,
  patch: ReleaseComponentPatch | undefined,
): InheritedReleaseComponentDraft {
  return {
    description:
      !patch || patch.op !== 'update' || patch.description === ''
        ? getComponentFieldValue(component, 'description')
        : patch.description,
    name:
      !patch || patch.op !== 'update' || patch.name === ''
        ? getComponentFieldValue(component, 'name')
        : patch.name,
    version:
      !patch || patch.op !== 'update' || patch.version === ''
        ? getComponentFieldValue(component, 'version')
        : patch.version,
  };
}

export function upsertInheritedComponentRemoval(
  patches: ReleaseComponentPatch[],
  component: ReleaseManagementOverviewComponent,
) {
  return withInheritedPatchOrdering(
    patches,
    {
      ...emptyReleaseComponentPatch,
      componentId: component.id,
      componentSlug: component.slug,
      op: 'remove',
    },
    component,
  );
}

export function revertInheritedComponentChanges(
  patches: ReleaseComponentPatch[],
  component: ReleaseManagementOverviewComponent,
) {
  return withInheritedPatchOrdering(patches, null, component);
}

export function syncInheritedComponentDraft(
  patches: ReleaseComponentPatch[],
  component: ReleaseManagementOverviewComponent,
  draft: InheritedReleaseComponentDraft,
) {
  const previousPatch = getInheritedComponentPatch(patches, component);
  const updatePatch: ReleaseComponentPatch = {
    ...emptyReleaseComponentPatch,
    componentId: component.id,
    componentSlug: component.slug,
    description:
      previousPatch?.op === 'update' ? previousPatch.description : '',
    name: previousPatch?.op === 'update' ? previousPatch.name : '',
    op: 'update',
    version: previousPatch?.op === 'update' ? previousPatch.version : '',
  };
  const nextPatch = {
    ...updatePatch,
    description:
      draft.description === getComponentFieldValue(component, 'description')
        ? ''
        : draft.description,
    name:
      draft.name === getComponentFieldValue(component, 'name')
        ? ''
        : draft.name,
    version:
      draft.version === getComponentFieldValue(component, 'version')
        ? ''
        : draft.version,
  };
  const hasAnyChange =
    nextPatch.description !== '' ||
    nextPatch.name !== '' ||
    nextPatch.version !== '';

  return withInheritedPatchOrdering(
    patches,
    hasAnyChange ? nextPatch : null,
    component,
  );
}

export function getAddedComponentDrafts(patches: ReleaseComponentPatch[]) {
  return patches.filter(
    (patch): patch is AddedReleaseComponentDraft => patch.op === 'add',
  );
}

export function replaceAddedComponentDrafts(
  patches: ReleaseComponentPatch[],
  addedComponentPatches: AddedReleaseComponentDraft[],
) {
  const { inheritedComponentPatches } = splitPatchesByAddOperation(patches);
  return [...inheritedComponentPatches, ...addedComponentPatches];
}

/**
 * After a component derived from an inherited row is persisted via PUT, store the fork id
 * so release submission does not create a duplicate component.
 */
export function syncInheritedPatchAfterFork(
  patches: ReleaseComponentPatch[],
  component: ReleaseManagementOverviewComponent,
  fork: Component,
) {
  const { inheritedComponentPatches, addedComponentPatches } =
    splitPatchesByAddOperation(patches);
  const nextInheritedPatches = inheritedComponentPatches.filter(
    (p) => !matchesInheritedComponent(p, component),
  );
  nextInheritedPatches.push({
    ...emptyReleaseComponentPatch,
    componentId: component.id,
    componentSlug: component.slug,
    description: fork.description ?? '',
    name: fork.name,
    op: 'update',
    resolvedForkComponentId: fork.id,
    slug: fork.slug ?? '',
    version: fork.version,
  });
  return [...nextInheritedPatches, ...addedComponentPatches];
}

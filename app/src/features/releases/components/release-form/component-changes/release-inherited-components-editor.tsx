import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReleaseFormValues } from '../../../schemas/release.schema';
import type { ReleaseManagementOverviewComponent } from '../../../types';
import {
  getInheritedComponentDraft,
  getInheritedComponentViewModels,
  revertInheritedComponentChanges,
  syncInheritedComponentDraft,
  upsertInheritedComponentRemoval,
} from './release-component-changes.utils';
import { ReleaseInheritedComponentCard } from './release-inherited-component-card';

type ReleaseInheritedComponentsEditorProps = {
  onChange: (patches: ReleaseFormValues['componentPatches']) => void;
  patches: ReleaseFormValues['componentPatches'];
  previousReleaseComponents: ReleaseManagementOverviewComponent[];
};

type InheritedComponentDrafts = Record<
  string,
  {
    description: string;
    name: string;
    version: string;
  }
>;

export function ReleaseInheritedComponentsEditor({
  onChange,
  patches,
  previousReleaseComponents,
}: ReleaseInheritedComponentsEditorProps) {
  const { t } = useTranslation();
  const [editingComponentIds, setEditingComponentIds] = useState<string[]>([]);
  const [editingDrafts, setEditingDrafts] = useState<InheritedComponentDrafts>(
    {},
  );
  const viewModels = useMemo(
    () => getInheritedComponentViewModels(previousReleaseComponents, patches),
    [patches, previousReleaseComponents],
  );

  const handleEdit = (componentId: string) => {
    setEditingComponentIds((currentIds) =>
      currentIds.includes(componentId)
        ? currentIds
        : [...currentIds, componentId],
    );
  };

  const handleCloseEditor = (componentId: string) => {
    setEditingComponentIds((currentIds) =>
      currentIds.filter((currentId) => currentId !== componentId),
    );
    setEditingDrafts((currentDrafts) => {
      const { [componentId]: _removedDraft, ...remainingDrafts } =
        currentDrafts;
      return remainingDrafts;
    });
  };

  const renderInheritedComponent = (viewModel: (typeof viewModels)[number]) => {
    const { component, patch, status } = viewModel;
    const draft =
      editingDrafts[component.id] ??
      getInheritedComponentDraft(component, patch);
    const isEditing =
      editingComponentIds.includes(component.id) || status === 'edited';

    return (
      <ReleaseInheritedComponentCard
        key={component.id}
        component={component}
        descriptionValue={draft.description}
        isEditing={isEditing}
        nameValue={draft.name}
        onDelete={() => {
          onChange(upsertInheritedComponentRemoval(patches, component));
          handleCloseEditor(component.id);
        }}
        onEdit={() => {
          setEditingDrafts((currentDrafts) => ({
            ...currentDrafts,
            [component.id]: getInheritedComponentDraft(component, patch),
          }));
          handleEdit(component.id);
        }}
        onFieldChange={(field, nextValue) => {
          const nextDraft = {
            ...draft,
            [field]: nextValue,
          };

          setEditingDrafts((currentDrafts) => ({
            ...currentDrafts,
            [component.id]: nextDraft,
          }));
          onChange(syncInheritedComponentDraft(patches, component, nextDraft));
          handleEdit(component.id);
        }}
        onRevert={() => {
          onChange(revertInheritedComponentChanges(patches, component));
          handleCloseEditor(component.id);
        }}
        status={status}
        versionValue={draft.version}
      />
    );
  };

  return (
    <div>
      {viewModels.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('Pages.Releases.Deployments.Form.noInheritedComponents')}
        </p>
      ) : (
        <div className="space-y-3">
          {viewModels.map(renderInheritedComponent)}
        </div>
      )}
    </div>
  );
}

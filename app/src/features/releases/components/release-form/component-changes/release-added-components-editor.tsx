import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  emptyReleaseComponentPatch,
  type ReleaseFormValues,
} from '../../../schemas/release.schema';
import { ReleaseAddedComponentCard } from './release-added-component-card';
import {
  getAddedComponentDrafts,
  replaceAddedComponentDrafts,
} from './release-component-changes.utils';

type ReleaseAddedComponentsEditorProps = {
  onChange: (patches: ReleaseFormValues['componentPatches']) => void;
  patches: ReleaseFormValues['componentPatches'];
};

export function ReleaseAddedComponentsEditor({
  onChange,
  patches,
}: ReleaseAddedComponentsEditorProps) {
  const { t } = useTranslation();
  const addedComponents = getAddedComponentDrafts(patches);

  const updateAddedComponents = (
    nextAddedComponents: typeof addedComponents,
  ) => {
    onChange(replaceAddedComponentDrafts(patches, nextAddedComponents));
  };

  const renderAddedComponent = (
    component: (typeof addedComponents)[number],
    index: number,
  ) => (
    <ReleaseAddedComponentCard
      key={`add-component-${index}`}
      component={component}
      index={index}
      onChange={(nextComponent) =>
        updateAddedComponents(
          addedComponents.map((currentComponent, currentIndex) =>
            currentIndex === index ? nextComponent : currentComponent,
          ),
        )
      }
      onRemove={() =>
        updateAddedComponents(
          addedComponents.filter((_, currentIndex) => currentIndex !== index),
        )
      }
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-medium text-sm">
            {t('Pages.Releases.Deployments.Form.addComponentsTitle')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('Pages.Releases.Deployments.Form.addComponentsDescription')}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            updateAddedComponents([
              ...addedComponents,
              { ...emptyReleaseComponentPatch, op: 'add' },
            ])
          }
        >
          <Plus className="size-4" />
          {t('Pages.Releases.Deployments.Form.addComponent')}
        </Button>
      </div>

      {addedComponents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('Pages.Releases.Deployments.Form.noAddedComponents')}
        </p>
      ) : (
        <div className="space-y-3">
          {addedComponents.map(renderAddedComponent)}
        </div>
      )}
    </div>
  );
}

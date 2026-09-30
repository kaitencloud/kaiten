import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AddedReleaseComponentDraft } from './release-component-changes.utils';
import { ReleaseComponentName } from './release-component-name';

type ReleaseAddedComponentCardProps = {
  component: AddedReleaseComponentDraft;
  index: number;
  onChange: (nextComponent: AddedReleaseComponentDraft) => void;
  onRemove: () => void;
};

export function ReleaseAddedComponentCard({
  component,
  index,
  onChange,
  onRemove,
}: ReleaseAddedComponentCardProps) {
  const { t } = useTranslation();
  const title =
    component.name.trim() === ''
      ? t('Pages.Releases.Deployments.Form.newComponentLabel', {
          index: index + 1,
        })
      : component.name;

  return (
    <div className="space-y-4 rounded-lg border border-border/60 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <ReleaseComponentName className="font-medium" name={title} />
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="size-4" />
          {t('Common.delete')}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {t('Pages.Releases.Deployments.Form.addComponentDescription')}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`new-component-${index}-name`}>
            {t('Features.Releases.Form.name')}
          </Label>
          <Input
            id={`new-component-${index}-name`}
            value={component.name}
            onChange={(event) =>
              onChange({ ...component, name: event.target.value })
            }
            placeholder={t(
              'Pages.Releases.Deployments.Form.componentNamePlaceholder',
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`new-component-${index}-version`}>
            {t('Features.Releases.Form.version')}
          </Label>
          <Input
            id={`new-component-${index}-version`}
            value={component.version}
            onChange={(event) =>
              onChange({ ...component, version: event.target.value })
            }
            placeholder="v1.0.0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`new-component-${index}-description`}>
          {t('Features.Releases.Form.description')}
        </Label>
        <Textarea
          id={`new-component-${index}-description`}
          value={component.description}
          onChange={(event) =>
            onChange({ ...component, description: event.target.value })
          }
          placeholder={t('Features.Releases.Form.descriptionPlaceholder')}
        />
      </div>
    </div>
  );
}

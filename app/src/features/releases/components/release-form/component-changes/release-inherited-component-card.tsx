import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { ReleaseManagementOverviewComponent } from '../../../types';
import type { InheritedReleaseComponentStatus } from './release-component-changes.utils';
import { ReleaseComponentName } from './release-component-name';

type ReleaseInheritedComponentCardProps = {
  component: ReleaseManagementOverviewComponent;
  descriptionValue: string;
  isEditing: boolean;
  nameValue: string;
  onDelete: () => void;
  onEdit: () => void;
  onFieldChange: (
    field: 'description' | 'name' | 'version',
    nextValue: string,
  ) => void;
  onRevert: () => void;
  status: InheritedReleaseComponentStatus;
  versionValue: string;
};

function StatusBadge({ status }: { status: InheritedReleaseComponentStatus }) {
  const { t } = useTranslation();

  if (status === 'unchanged') {
    return null;
  }

  const variant = status === 'removed' ? 'destructive' : 'secondary';
  const labelKey =
    status === 'removed'
      ? 'Pages.Releases.Deployments.Form.statuses.removed'
      : 'Pages.Releases.Deployments.Form.statuses.edited';

  return <Badge variant={variant}>{t(labelKey)}</Badge>;
}

function SummaryActions({
  onDelete,
  onEdit,
}: {
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onEdit}>
        {t('Pages.Releases.Deployments.Form.editComponent')}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
        <Trash2 className="size-4" />
        {t('Pages.Releases.Deployments.Form.deleteComponent')}
      </Button>
    </div>
  );
}

function EditingActions({
  onDelete,
  onRevert,
}: {
  onDelete: () => void;
  onRevert: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onRevert}>
        {t('Pages.Releases.Deployments.Form.revertComponent')}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
        <Trash2 className="size-4" />
        {t('Pages.Releases.Deployments.Form.deleteComponent')}
      </Button>
    </div>
  );
}

function RemovedState({ onRevert }: { onRevert: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
      <p className="text-sm text-muted-foreground">
        {t('Pages.Releases.Deployments.Form.componentRemoved')}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRevert}>
        {t('Pages.Releases.Deployments.Form.revertComponent')}
      </Button>
    </div>
  );
}

function EditingFields({
  componentId,
  descriptionValue,
  nameValue,
  onFieldChange,
  versionValue,
}: {
  componentId: string;
  descriptionValue: string;
  nameValue: string;
  onFieldChange: (
    field: 'description' | 'name' | 'version',
    nextValue: string,
  ) => void;
  versionValue: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${componentId}-name`}>
            {t('Features.Releases.Form.name')}
          </Label>
          <Input
            id={`${componentId}-name`}
            value={nameValue}
            onChange={(event) => onFieldChange('name', event.target.value)}
            placeholder={t(
              'Pages.Releases.Deployments.Form.componentNamePlaceholder',
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${componentId}-version`}>
            {t('Features.Releases.Form.version')}
          </Label>
          <Input
            id={`${componentId}-version`}
            value={versionValue}
            onChange={(event) => onFieldChange('version', event.target.value)}
            placeholder="v1.0.0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${componentId}-description`}>
          {t('Features.Releases.Form.description')}
        </Label>
        <Textarea
          id={`${componentId}-description`}
          value={descriptionValue}
          onChange={(event) => onFieldChange('description', event.target.value)}
          placeholder={t('Features.Releases.Form.descriptionPlaceholder')}
        />
      </div>
    </div>
  );
}

export function ReleaseInheritedComponentCard({
  component,
  descriptionValue,
  isEditing,
  nameValue,
  onDelete,
  onEdit,
  onFieldChange,
  onRevert,
  status,
  versionValue,
}: ReleaseInheritedComponentCardProps) {
  const ComponentIcon = dataModelIcons.component;

  return (
    <div className="rounded-lg border border-border/60 px-4 py-4">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <ComponentIcon className="size-4 shrink-0 text-primary-subtle-foreground" />
              <ReleaseComponentName className="font-medium" name={nameValue} />
              <StatusBadge status={status} />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            <Badge variant="outline">{versionValue}</Badge>
            {status === 'removed' ? null : isEditing ? (
              <EditingActions onDelete={onDelete} onRevert={onRevert} />
            ) : (
              <SummaryActions onDelete={onDelete} onEdit={onEdit} />
            )}
          </div>
        </div>

        {descriptionValue ? (
          <p className="text-sm text-muted-foreground">{descriptionValue}</p>
        ) : null}
      </div>

      {status === 'removed' ? (
        <RemovedState onRevert={onRevert} />
      ) : isEditing ? (
        <EditingFields
          componentId={component.id}
          descriptionValue={descriptionValue}
          nameValue={nameValue}
          onFieldChange={onFieldChange}
          versionValue={versionValue}
        />
      ) : null}
    </div>
  );
}

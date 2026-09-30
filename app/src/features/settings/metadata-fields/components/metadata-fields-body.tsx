import type { DragEndEvent, useSensors } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { resourceTypeLabel } from '../metadata-field-helpers';
import { ResourceTypeIcon } from './resource-type-icon';
import type { MetadataResourceType, MetadataSettingsField } from '../types';
import { MetadataFieldList } from './metadata-field-list';
import { EmptyState } from './metadata-field-states';

type MetadataFieldsBodyProps = {
  activeFields: MetadataSettingsField[];
  archivedFields: MetadataSettingsField[];
  disabled: boolean;
  fields: MetadataSettingsField[];
  hasVisibleFields: boolean;
  isLoading: boolean;
  onArchive: (field: MetadataSettingsField) => void;
  onCreate: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDuplicate: (field: MetadataSettingsField) => void;
  onEdit: (field: MetadataSettingsField) => void;
  onUnarchive: (field: MetadataSettingsField) => void;
  onShowArchivedChange: (value: boolean) => void;
  reorderDisabled: boolean;
  resourceType: MetadataResourceType;
  sensors: ReturnType<typeof useSensors>;
  showArchived: boolean;
};

function Skeletons() {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-20 animate-pulse rounded-lg border bg-muted/40"
        />
      ))}
    </>
  );
}

export function MetadataFieldsBody({
  activeFields,
  archivedFields,
  disabled,
  fields,
  hasVisibleFields,
  isLoading,
  onArchive,
  onCreate,
  onDragEnd,
  onDuplicate,
  onEdit,
  onUnarchive,
  onShowArchivedChange,
  reorderDisabled,
  resourceType,
  sensors,
  showArchived,
}: MetadataFieldsBodyProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <ResourceTypeIcon
            className="size-5 text-primary-subtle-foreground"
            resourceType={resourceType}
          />
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              {resourceTypeLabel(resourceType)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {activeFields.length}{' '}
              {t('Pages.Settings.Metadata.activeCount', 'active')} ·{' '}
              {archivedFields.length}{' '}
              {t('Pages.Settings.Metadata.archivedCount', 'archived')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label
            htmlFor="metadata-show-archived"
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <Switch
              id="metadata-show-archived"
              size="sm"
              checked={showArchived}
              onCheckedChange={onShowArchivedChange}
            />
            {t('Pages.Settings.Metadata.showArchived', 'Show archived')}
          </Label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        {isLoading ? (
          <div className="space-y-3">
            <Skeletons />
          </div>
        ) : hasVisibleFields ? (
          <MetadataFieldList
            activeFields={activeFields}
            disabled={disabled}
            fields={fields}
            onArchive={onArchive}
            onDragEnd={onDragEnd}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onUnarchive={onUnarchive}
            reorderDisabled={reorderDisabled}
            sensors={sensors}
            showArchived={showArchived}
          />
        ) : (
          <EmptyState
            disabled={disabled}
            hasArchivedFields={archivedFields.length > 0}
            onCreate={onCreate}
          />
        )}
      </div>
    </div>
  );
}

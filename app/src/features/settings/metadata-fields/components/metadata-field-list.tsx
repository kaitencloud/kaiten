import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { isArchivedField } from '../metadata-field-helpers';
import { sortMetadataFields } from '../schemas/metadata-fields.schema';
import type { MetadataSettingsField } from '../types';
import { MetadataFieldRow } from './metadata-field-row';

type RowHandlers = {
  onArchive: (field: MetadataSettingsField) => void;
  onDuplicate: (field: MetadataSettingsField) => void;
  onEdit: (field: MetadataSettingsField) => void;
  onUnarchive: (field: MetadataSettingsField) => void;
};

type MetadataFieldListProps = RowHandlers & {
  activeFields: MetadataSettingsField[];
  disabled: boolean;
  fields: MetadataSettingsField[];
  onDragEnd: (event: DragEndEvent) => void;
  reorderDisabled: boolean;
  sensors: ReturnType<typeof useSensors>;
  showArchived: boolean;
};

function createActiveRowRenderer(
  options: RowHandlers & { disabled: boolean; reorderDisabled: boolean },
) {
  return function renderActiveRow(field: MetadataSettingsField) {
    return <MetadataFieldRow key={field.id} field={field} {...options} />;
  };
}

function ActiveMetadataFieldRows({
  rows,
  ...options
}: RowHandlers & {
  disabled: boolean;
  reorderDisabled: boolean;
  rows: MetadataSettingsField[];
}) {
  return rows.map(createActiveRowRenderer(options));
}

function createArchivedRowRenderer(handlers: RowHandlers, disabled: boolean) {
  return function renderArchivedRow(field: MetadataSettingsField) {
    return (
      <MetadataFieldRow
        key={field.id}
        disabled={disabled}
        field={field}
        reorderDisabled
        {...handlers}
      />
    );
  };
}

function renderArchivedRows(
  rows: MetadataSettingsField[],
  handlers: RowHandlers,
  disabled: boolean,
) {
  return rows.map(createArchivedRowRenderer(handlers, disabled));
}

export function MetadataFieldList({
  activeFields,
  disabled,
  fields,
  onArchive,
  onDragEnd,
  onDuplicate,
  onEdit,
  onUnarchive,
  reorderDisabled,
  sensors,
  showArchived,
}: MetadataFieldListProps) {
  const handlers: RowHandlers = { onArchive, onDuplicate, onEdit, onUnarchive };
  const sortedActiveFields = sortMetadataFields(activeFields);
  const sortedArchivedFields = sortMetadataFields(
    fields.filter((field) => isArchivedField(field)),
  );

  return (
    <div className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={sortedActiveFields.map((field) => field.id)}
          strategy={verticalListSortingStrategy}
        >
          <ActiveMetadataFieldRows
            rows={sortedActiveFields}
            disabled={disabled}
            reorderDisabled={reorderDisabled}
            {...handlers}
          />
        </SortableContext>
      </DndContext>

      {showArchived
        ? renderArchivedRows(sortedArchivedFields, handlers, disabled)
        : null}
    </div>
  );
}

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Archive,
  ArchiveRestore,
  Copy,
  GripVertical,
  Pencil,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  isArchivedField,
  primaryTypeFromField,
  primaryTypeLabel,
} from '../metadata-field-helpers';
import type { MetadataSettingsField } from '../types';

type MetadataFieldRowProps = {
  disabled: boolean;
  field: MetadataSettingsField;
  onArchive: (field: MetadataSettingsField) => void;
  onDuplicate: (field: MetadataSettingsField) => void;
  onEdit: (field: MetadataSettingsField) => void;
  onUnarchive: (field: MetadataSettingsField) => void;
  reorderDisabled: boolean;
};

type RowActionsProps = {
  archived: boolean;
  disabled: boolean;
  field: MetadataSettingsField;
  onArchive: (field: MetadataSettingsField) => void;
  onDuplicate: (field: MetadataSettingsField) => void;
  onEdit: (field: MetadataSettingsField) => void;
  onUnarchive: (field: MetadataSettingsField) => void;
  unsupported: boolean;
};

function RowActions({
  archived,
  disabled,
  field,
  onArchive,
  onDuplicate,
  onEdit,
  onUnarchive,
  unsupported,
}: RowActionsProps) {
  const { t } = useTranslation();

  // Archived rows can only be restored — their schema no longer composes into
  // the active validation, so edit/duplicate/archive don't apply.
  if (archived) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onUnarchive(field)}
      >
        <ArchiveRestore className="size-4" />
        {t('Pages.Settings.Metadata.List.unarchiveButton', 'Unarchive')}
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || unsupported}
        onClick={() => onEdit(field)}
      >
        <Pencil className="size-4" />
        {t('Common.edit', 'Edit')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onDuplicate(field)}
      >
        <Copy className="size-4" />
        {t('Pages.Settings.Metadata.List.duplicateButton', 'Duplicate')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onArchive(field)}
      >
        <Archive className="size-4" />
        {t('Pages.Settings.Metadata.List.archiveButton', 'Archive')}
      </Button>
    </>
  );
}

export function MetadataFieldRow({
  disabled,
  field,
  onArchive,
  onDuplicate,
  onEdit,
  onUnarchive,
  reorderDisabled,
}: MetadataFieldRowProps) {
  const { t } = useTranslation();
  const archived = isArchivedField(field);
  const primaryType = primaryTypeFromField(field);
  const description =
    typeof field.jsonSchema.description === 'string'
      ? field.jsonSchema.description
      : '';
  const unsupported = primaryType === null;
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    disabled: reorderDisabled || archived,
    id: field.id,
  });

  const style = {
    opacity: isDragging ? 0.55 : 1,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group grid gap-3 rounded-lg border bg-background px-3 py-3 shadow-xs transition-colors sm:grid-cols-[auto_1fr_auto] sm:items-center',
        archived && 'bg-muted/40 text-muted-foreground',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
          (reorderDisabled || archived) && 'cursor-not-allowed opacity-40',
        )}
        disabled={reorderDisabled || archived}
        aria-label={t(
          'Pages.Settings.Metadata.List.reorderField',
          'Reorder field',
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-medium text-foreground">
            {field.label}
          </h3>
          <Badge variant="secondary" className="font-mono text-[11px]">
            {field.key}
          </Badge>
          <Badge variant={unsupported ? 'destructive' : 'outline'}>
            {unsupported
              ? t('Pages.Settings.Metadata.Types.unsupported', 'Unsupported')
              : primaryTypeLabel(primaryType)}
          </Badge>
          {archived ? (
            <Badge variant="outline">
              {t('Pages.Settings.Metadata.List.archivedBadge', 'Archived')}
            </Badge>
          ) : null}
        </div>
        {description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 sm:justify-end">
        <RowActions
          archived={archived}
          disabled={disabled}
          field={field}
          onArchive={onArchive}
          onDuplicate={onDuplicate}
          onEdit={onEdit}
          onUnarchive={onUnarchive}
          unsupported={unsupported}
        />
      </div>
    </div>
  );
}

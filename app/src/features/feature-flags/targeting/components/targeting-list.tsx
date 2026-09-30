import { useTranslation } from 'react-i18next';
import type { TargetingListProps } from '../types';
import { TargetingFormDialog } from './targeting-form-dialog';
import {
  TargetingDeleteDialog,
  TargetingEditDialog,
} from './targeting-list-dialogs';
import {
  TargetingListEmptyStates,
  TargetingListHeader,
} from './targeting-list-header';
import { TargetingListSortableItems } from './targeting-list-sortable-items';
import { useTargetingListController } from './use-targeting-list-controller';

export function TargetingList({
  targetings: initialTargetings,
  variants,
  onChange,
  disabled = false,
  disableCelValidation = false,
}: TargetingListProps) {
  const { t } = useTranslation();
  const targetings = initialTargetings;
  const {
    deletingIndex,
    editingIndex,
    getTargetingId,
    handleAdd,
    handleCloseDeleteDialog,
    handleCloseEditDialog,
    handleDelete,
    handleDragEnd,
    handleMove,
    handleOpenCreateDialog,
    handleUpdate,
    isCreateDialogOpen,
    sensors,
    setDeletingIndex,
    setEditingIndex,
    setIsCreateDialogOpen,
  } = useTargetingListController({
    onChange,
    targetings,
  });

  const hasTargetings = targetings.length > 0;
  const canCreate = variants.length > 0;

  return (
    <div className="space-y-4">
      <TargetingListHeader
        canCreate={canCreate}
        disabled={disabled}
        onCreate={handleOpenCreateDialog}
        t={t}
      />

      <TargetingListEmptyStates
        disabled={disabled}
        hasTargetings={hasTargetings}
        onCreate={handleOpenCreateDialog}
        t={t}
        variantsCount={variants.length}
      />

      <TargetingListSortableItems
        getTargetingId={getTargetingId}
        onDelete={setDeletingIndex}
        onDragEnd={handleDragEnd}
        onEdit={setEditingIndex}
        onMove={handleMove}
        sensors={sensors}
        targetings={targetings}
      />

      {/* Create Dialog */}
      <TargetingFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        variants={variants}
        onSubmit={handleAdd}
        mode="create"
        disableCelValidation={disableCelValidation}
      />

      <TargetingEditDialog
        editingIndex={editingIndex}
        onClose={handleCloseEditDialog}
        onSubmit={handleUpdate}
        targetings={targetings}
        variants={variants}
        disableCelValidation={disableCelValidation}
      />

      <TargetingDeleteDialog
        deletingIndex={deletingIndex}
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDelete}
      />
    </div>
  );
}

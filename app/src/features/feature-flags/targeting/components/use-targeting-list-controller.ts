import {
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useRef, useState } from 'react';
import type { Targeting, TargetingListProps } from '../types';

type UseTargetingListControllerProps = Pick<
  TargetingListProps,
  'onChange' | 'targetings'
>;

export function useTargetingListController({
  onChange,
  targetings,
}: UseTargetingListControllerProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const targetingIds = useRef<WeakMap<Targeting, string> | null>(null);
  const nextTargetingId = useRef(0);

  const getTargetingId = useCallback((targeting: Targeting) => {
    const ids = (targetingIds.current ??= new WeakMap<Targeting, string>());
    const existingId = ids.get(targeting);
    if (existingId) {
      return existingId;
    }

    const generatedId = `targeting-${nextTargetingId.current++}`;
    ids.set(targeting, generatedId);
    return generatedId;
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleChange = useCallback(
    (newTargetings: Targeting[]) => {
      onChange(newTargetings);
    },
    [onChange],
  );

  const handleAdd = useCallback(
    (targeting: Targeting) => {
      handleChange([...targetings, targeting]);
    },
    [handleChange, targetings],
  );

  const handleUpdate = useCallback(
    (index: number, targeting: Targeting) => {
      const newTargetings = [...targetings];
      newTargetings[index] = targeting;
      handleChange(newTargetings);
      setEditingIndex(null);
    },
    [handleChange, targetings],
  );

  const handleDelete = useCallback(
    (index: number) => {
      handleChange(
        targetings.filter((_, currentIndex) => currentIndex !== index),
      );
      setDeletingIndex(null);
    },
    [handleChange, targetings],
  );

  const handleMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      const newTargetings = [...targetings];
      const [moved] = newTargetings.splice(fromIndex, 1);
      newTargetings.splice(toIndex, 0, moved);
      handleChange(newTargetings);
    },
    [handleChange, targetings],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = targetings.findIndex(
        (targeting) => getTargetingId(targeting) === active.id,
      );
      const newIndex = targetings.findIndex(
        (targeting) => getTargetingId(targeting) === over.id,
      );

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      handleChange(arrayMove(targetings, oldIndex, newIndex));
    },
    [getTargetingId, handleChange, targetings],
  );

  function handleOpenCreateDialog() {
    setIsCreateDialogOpen(true);
  }

  function handleCloseEditDialog() {
    setEditingIndex(null);
  }

  function handleCloseDeleteDialog() {
    setDeletingIndex(null);
  }

  return {
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
  };
}

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type SensorDescriptor,
  type SensorOptions,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Targeting } from '../types';
import { SortableTargetingItem } from './sortable-targeting-item';

type TargetingListSortableItemsProps = {
  getTargetingId: (targeting: Targeting) => string;
  onDelete: (index: number) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onEdit: (index: number) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  sensors: SensorDescriptor<SensorOptions>[];
  targetings: Targeting[];
};

type TargetingListItemRowProps = {
  getTargetingId: (targeting: Targeting) => string;
  index: number;
  onDelete: (index: number) => void;
  onEdit: (index: number) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  targeting: Targeting;
  totalItems: number;
};

function TargetingListItemRow({
  getTargetingId,
  index,
  onDelete,
  onEdit,
  onMove,
  targeting,
  totalItems,
}: TargetingListItemRowProps) {
  function handleEdit() {
    onEdit(index);
  }

  function handleDelete() {
    onDelete(index);
  }

  function handleMoveUp() {
    onMove(index, index - 1);
  }

  function handleMoveDown() {
    onMove(index, index + 1);
  }

  return (
    <SortableTargetingItem
      key={getTargetingId(targeting)}
      id={getTargetingId(targeting)}
      targeting={targeting}
      index={index}
      canMoveUp={index > 0}
      canMoveDown={index < totalItems - 1}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onMoveUp={handleMoveUp}
      onMoveDown={handleMoveDown}
    />
  );
}

export function TargetingListSortableItems({
  getTargetingId,
  onDelete,
  onDragEnd,
  onEdit,
  onMove,
  sensors,
  targetings,
}: TargetingListSortableItemsProps) {
  const items = targetings.map(getTargetingId);

  function renderTargetingItem(targeting: Targeting, index: number) {
    return (
      <TargetingListItemRow
        getTargetingId={getTargetingId}
        index={index}
        key={getTargetingId(targeting)}
        onDelete={onDelete}
        onEdit={onEdit}
        onMove={onMove}
        targeting={targeting}
        totalItems={targetings.length}
      />
    );
  }

  return (
    <div className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {targetings.map(renderTargetingItem)}
        </SortableContext>
      </DndContext>
    </div>
  );
}

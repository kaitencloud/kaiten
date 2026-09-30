import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TargetingItem } from './targeting-item';

// Define props locally or import from a types file if available,
// since TargetingItemProps is not exported from targeting-item.tsx
type TargetingItemProps = React.ComponentProps<typeof TargetingItem>;

export type SortableTargetingItemProps = TargetingItemProps & {
  id: string;
};

export function SortableTargetingItem({
  id,
  ...props
}: SortableTargetingItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group cursor-grab active:cursor-grabbing hover:scale-[1.01] transition-transform duration-200 ease-out"
      {...attributes}
      {...listeners}
    >
      <TargetingItem {...props} />
    </div>
  );
}

import { X } from 'lucide-react';
import type { ReactNode } from 'react';

type FilterChipProps = {
  /**
   * What the chip says: the control that opens the editor of a filter, or the text
   * of a scope a page puts beside its search. The button that takes the chip off
   * follows it.
   */
  children: ReactNode;
  onRemove: () => void;
  /** What the button that takes the chip off is named, for a screen reader. */
  removeLabel: string;
};

/**
 * The chip of a filter, or of a scope the page puts beside its search: a pill with
 * the button that takes it off. It is one component so that the chips of a toolbar
 * read as one set, and it carries the `data-slot` that the specs find them by.
 */
export function FilterChip({
  children,
  onRemove,
  removeLabel,
}: FilterChipProps) {
  return (
    <div
      data-slot="filter-chip"
      className="bg-secondary text-secondary-foreground inline-flex h-9 items-center gap-1 rounded-full px-3"
    >
      {children}
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        onClick={onRemove}
        aria-label={removeLabel}
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

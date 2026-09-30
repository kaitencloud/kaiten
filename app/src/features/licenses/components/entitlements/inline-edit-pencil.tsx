import { Pencil } from 'lucide-react';

/**
 * The pencil an inline-editable cell reveals on hover and keyboard focus. The
 * cell's button carries the `group/inline-edit` class.
 */
export const InlineEditPencil = () => (
  <Pencil
    aria-hidden
    className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/inline-edit:opacity-100 group-focus-visible/inline-edit:opacity-100"
  />
);

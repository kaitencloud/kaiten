import type { ReactNode } from 'react';

/**
 * The header of a column of amounts or quantities, aligned right over them. It is
 * a function that returns a header, not a component, so it has a module of its
 * own: a file that exports components and anything else cannot be hot reloaded.
 */
export const rightAlignedHeader = (title: ReactNode) => () => (
  <div className="text-right">{title}</div>
);

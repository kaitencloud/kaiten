import { useEffect, useRef } from 'react';
import type { UseFilterBuilderResult } from '@/functionals/filters';

type FilterControls = Pick<
  UseFilterBuilderResult<unknown>['normal'],
  'activeFilterIds' | 'addFilter' | 'setValue' | 'values'
>;

type UseSeededFilterArgs = {
  /** The filter builder's `normal` part. */
  controls: FilterControls;
  filterId: string;
  /** Called once the person changes or clears the filter away from the seed: the address no longer says what the list shows. */
  onSeedDropped: () => void;
  /** The value the address asks the filter to hold, if it does. */
  seed: string | undefined;
};

/**
 * Keeps a filter that a link seeds (`?status=`) and the address in step. The filter
 * builder only takes its initial values when the list opens, so:
 *
 * - a link to the page that is followed while it is already open, with another seed, sets
 *   the filter to it (the person asked for that view);
 * - a person who changes or clears the filter by hand takes it away from the seed, and
 *   `onSeedDropped` has the address forget it, so that a reload or a copied link shows what
 *   the page shows. A change of the seed alone never counts as the person's.
 */
export function useSeededFilter({
  controls,
  filterId,
  onSeedDropped,
  seed,
}: UseSeededFilterArgs) {
  const { activeFilterIds, addFilter, setValue, values } = controls;
  const current = activeFilterIds.includes(filterId)
    ? values[filterId] || undefined
    : undefined;
  const last = useRef({ current, seed });

  useEffect(() => {
    const before = last.current;
    last.current = { current, seed };

    if (seed !== before.seed) {
      if (seed !== undefined && seed !== current) {
        addFilter(filterId);
        setValue(filterId, seed);
      }

      return;
    }

    if (current !== before.current && seed !== undefined && current !== seed) {
      onSeedDropped();
    }
  }, [addFilter, current, filterId, onSeedDropped, seed, setValue]);
}

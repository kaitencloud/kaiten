import { useStore } from '@tanstack/react-store';
import { useEffect, useMemo } from 'react';
import { debounce } from '@/lib/debounce';
import { createInitialState } from '../logic/filter-builder-defaults';
import {
  createFilterBuilderStore,
  type FilterBuilderStoreActions,
} from '../store/filter-builder-store';
import type {
  AdvancedFilterRule,
  FilterCombinator,
} from '../types/filter.types';

type UseFilterBuilderStoreStateOptions<T> = {
  data: T[];
  resetOnDataChange: boolean;
  debounceMs: number;
  /** Filters that are always shown, and so need no place among the active ones. */
  alwaysShownIds: string[];
  defaultActiveFilterIds: string[];
  /** What the normal filters hold when the store is created: where the state starts, not what it resets to. */
  initialValues: Record<string, string>;
  defaultAdvancedCombinator: FilterCombinator;
  sanitizedDefaultAdvancedRules: AdvancedFilterRule[];
};

const createDebouncedSync = (
  actions: FilterBuilderStoreActions,
  debounceMs: number,
) =>
  debounce((nextValues: Record<string, string>) => {
    actions.setDebouncedValues(nextValues);
  }, debounceMs);

// Sentinel for "never reset": a constant identity keeps the memo below from
// ever invalidating, which is what `resetOnDataChange: false` asks for.
const STABLE_STORE_KEY = '__stable_store__';

export const useFilterBuilderStoreState = <T>({
  data,
  resetOnDataChange,
  debounceMs,
  alwaysShownIds,
  defaultActiveFilterIds,
  defaultAdvancedCombinator,
  initialValues,
  sanitizedDefaultAdvancedRules,
}: UseFilterBuilderStoreStateOptions<T>) => {
  const storeKey = resetOnDataChange ? data : STABLE_STORE_KEY;

  // Keyed on `storeKey` alone, deliberately: changing the *defaults* must not
  // throw away filters the user has already set, only a new data identity may
  // (that is what `resetOnDataChange` means). `react/exhaustive-deps` is off
  // for this repo, so the narrow dependency list stands as written.
  //
  // `useMemo` rather than a ref written during render: React may in principle
  // discard a memo, and the only thing that costs here is a filter reset --
  // exactly what this hook already does whenever the key moves.
  const { store, actions } = useMemo(
    () =>
      createFilterBuilderStore(
        createInitialState(
          defaultActiveFilterIds,
          initialValues,
          alwaysShownIds,
          sanitizedDefaultAdvancedRules,
          defaultAdvancedCombinator,
        ),
      ),
    [storeKey],
  );

  const state = useStore(store, (snapshot) => snapshot);

  const syncDebouncedValues = useMemo(
    () => createDebouncedSync(actions, debounceMs),
    [actions, debounceMs],
  );

  // Drop a pending sync when the debounce is replaced or the hook unmounts,
  // so a trailing call cannot land on a store nobody reads any more.
  useEffect(() => () => syncDebouncedValues.cancel(), [syncDebouncedValues]);

  return {
    actions,
    state,
    syncDebouncedValues,
  };
};

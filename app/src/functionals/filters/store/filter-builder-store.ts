import { Store } from '@tanstack/react-store';
import type {
  AdvancedFilterRule,
  FilterCombinator,
} from '../types/filter.types';

export type FilterBuilderStoreState = {
  activeFilterIds: string[];
  values: Record<string, string>;
  debouncedValues: Record<string, string>;
  advancedCombinator: FilterCombinator;
  advancedRules: AdvancedFilterRule[];
};

type StateUpdater<T> = T | ((current: T) => T);

export type FilterBuilderStoreActions = {
  setActiveFilterIds: (updater: StateUpdater<string[]>) => void;
  setAdvancedCombinator: (combinator: FilterCombinator) => void;
  setAdvancedRules: (updater: StateUpdater<AdvancedFilterRule[]>) => void;
  setDebouncedValues: (updater: StateUpdater<Record<string, string>>) => void;
  setValues: (updater: StateUpdater<Record<string, string>>) => void;
  resetState: (state: FilterBuilderStoreState) => void;
};

export type FilterBuilderStoreEntry = {
  store: Store<FilterBuilderStoreState>;
  actions: FilterBuilderStoreActions;
};

const resolveUpdater = <T>(updater: StateUpdater<T>, current: T): T => {
  if (typeof updater === 'function') {
    return (updater as (value: T) => T)(current);
  }

  return updater;
};

export const createFilterBuilderStore = (
  initialState: FilterBuilderStoreState,
): FilterBuilderStoreEntry => {
  const store = new Store<FilterBuilderStoreState>(initialState);

  const actions: FilterBuilderStoreActions = {
    setActiveFilterIds: (updater) => {
      store.setState((state) => {
        const next = resolveUpdater(updater, state.activeFilterIds);
        if (next === state.activeFilterIds) {
          return state;
        }

        return {
          ...state,
          activeFilterIds: next,
        };
      });
    },
    setValues: (updater) => {
      store.setState((state) => {
        const next = resolveUpdater(updater, state.values);
        if (next === state.values) {
          return state;
        }

        return {
          ...state,
          values: next,
        };
      });
    },
    setDebouncedValues: (updater) => {
      store.setState((state) => {
        const next = resolveUpdater(updater, state.debouncedValues);
        if (next === state.debouncedValues) {
          return state;
        }

        return {
          ...state,
          debouncedValues: next,
        };
      });
    },
    setAdvancedCombinator: (combinator) => {
      store.setState((state) => {
        if (state.advancedCombinator === combinator) {
          return state;
        }

        return {
          ...state,
          advancedCombinator: combinator,
        };
      });
    },
    setAdvancedRules: (updater) => {
      store.setState((state) => {
        const next = resolveUpdater(updater, state.advancedRules);
        if (next === state.advancedRules) {
          return state;
        }

        return {
          ...state,
          advancedRules: next,
        };
      });
    },
    resetState: (state) => {
      store.setState((current) => {
        if (
          current.activeFilterIds === state.activeFilterIds &&
          current.values === state.values &&
          current.debouncedValues === state.debouncedValues &&
          current.advancedCombinator === state.advancedCombinator &&
          current.advancedRules === state.advancedRules
        ) {
          return current;
        }

        return state;
      });
    },
  };

  return { store, actions };
};

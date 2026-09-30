import { DEFAULT_DEBOUNCE_MS } from '../logic/filter-builder-defaults';
import type {
  UseFilterBuilderProps,
  UseFilterBuilderResult,
} from '../types/use-filter-builder.types';
import { useFilterBuilderActions } from './use-filter-builder-actions';
import { useFilterBuilderConfig } from './use-filter-builder-config';
import { useFilterBuilderDerivedState } from './use-filter-builder-derived-state';
import { useFilterBuilderStoreState } from './use-filter-builder-store-state';

export type {
  UseFilterBuilderProps,
  UseFilterBuilderResult,
} from '../types/use-filter-builder.types';

export const useFilterBuilder = <T>({
  data,
  fields,
  pinnedFilterIds,
  quickAccessFilterIds,
  defaultNormalFilterIds,
  defaultAdvancedCombinator = 'and',
  defaultAdvancedRules = [],
  debounceMs = DEFAULT_DEBOUNCE_MS,
  resetOnDataChange = false,
}: UseFilterBuilderProps<T>): UseFilterBuilderResult<T> => {
  const config = useFilterBuilderConfig({
    fields,
    defaultAdvancedRules,
    defaultNormalFilterIds,
    pinnedFilterIds,
    quickAccessFilterIds,
  });
  const { actions, state, syncDebouncedValues } = useFilterBuilderStoreState({
    data,
    resetOnDataChange,
    debounceMs,
    defaultActiveFilterIds: config.defaultActiveFilterIds,
    defaultAdvancedCombinator,
    sanitizedDefaultAdvancedRules: config.sanitizedDefaultAdvancedRules,
  });
  const derivedState = useFilterBuilderDerivedState({
    data,
    fields,
    activeFilterIdsState: state.activeFilterIds,
    valuesState: state.values,
    debouncedValuesState: state.debouncedValues,
    advancedCombinatorState: state.advancedCombinator,
    advancedRulesState: state.advancedRules,
    defaultActiveFilterIds: config.defaultActiveFilterIds,
    normalFilterableFields: config.normalFilterableFields,
    advancedFilterableFields: config.advancedFilterableFields,
    normalFieldIdSet: config.normalFieldIdSet,
    sanitizedPinnedIds: config.sanitizedPinnedIds,
    sanitizedQuickAccessIds: config.sanitizedQuickAccessIds,
  });
  const filterActions = useFilterBuilderActions({
    actions,
    fields,
    advancedFilterableFields: config.advancedFilterableFields,
    normalFieldIdSet: config.normalFieldIdSet,
    sanitizedPinnedIds: config.sanitizedPinnedIds,
    sanitizedQuickAccessIds: config.sanitizedQuickAccessIds,
    syncDebouncedValues,
    defaultActiveFilterIds: config.defaultActiveFilterIds,
    sanitizedDefaultAdvancedRules: config.sanitizedDefaultAdvancedRules,
    defaultAdvancedCombinator,
  });

  return {
    filteredData: derivedState.filteredData,
    normal: {
      filterableFields: config.normalFilterableFields,
      pinnedFields: derivedState.pinnedFields,
      pinnedFilterIds: config.sanitizedPinnedIds,
      quickAccessFields: derivedState.quickAccessFields,
      quickAccessFilterIds: config.sanitizedQuickAccessIds,
      activeFields: derivedState.activeFields,
      availableFields: derivedState.availableFields,
      activeFilterIds: derivedState.activeFilterIds,
      values: derivedState.values,
      addFilter: filterActions.addFilter,
      removeFilter: filterActions.removeFilter,
      setValue: filterActions.setValue,
    },
    advanced: {
      filterableFields: config.advancedFilterableFields,
      combinator: derivedState.advancedCombinator,
      setCombinator: actions.setAdvancedCombinator,
      rules: derivedState.advancedRules,
      addRule: filterActions.addRule,
      updateRule: filterActions.updateRule,
      removeRule: filterActions.removeRule,
      clearRules: filterActions.clearRules,
      ruleCount: derivedState.ruleCount,
    },
    hasActiveFilters: derivedState.hasActiveFilters,
    resetAll: filterActions.resetAll,
  };
};

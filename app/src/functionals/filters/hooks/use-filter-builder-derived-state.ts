import { useMemo } from 'react';
import {
  sanitizeAdvancedRule,
  sanitizeValuesForFieldIds,
} from '../logic/filter-builder-defaults';
import {
  hasActiveFilterValues,
  hasConfiguredNormalFilters,
  resolveActiveNormalFilterIds,
  resolveAvailableFields,
  resolveFieldsByIds,
} from '../logic/filter-builder-selectors';
import { applyFilterModel } from '../logic/filter-logic';
import type {
  AdvancedFilterRule,
  FilterCombinator,
  FilterFieldDefinition,
  FilterModel,
} from '../types/filter.types';

type UseFilterBuilderDerivedStateOptions<T> = {
  data: T[];
  fields: FilterFieldDefinition<T>[];
  activeFilterIdsState: string[];
  valuesState: Record<string, string>;
  debouncedValuesState: Record<string, string>;
  advancedCombinatorState: FilterCombinator;
  advancedRulesState: AdvancedFilterRule[];
  defaultActiveFilterIds: string[];
  normalFilterableFields: FilterFieldDefinition<T>[];
  advancedFilterableFields: FilterFieldDefinition<T>[];
  normalFieldIdSet: Set<string>;
  sanitizedPinnedIds: string[];
  sanitizedQuickAccessIds: string[];
};

const useResolvedFilterBuilderState = <T>({
  fields,
  activeFilterIdsState,
  valuesState,
  debouncedValuesState,
  advancedRulesState,
  normalFilterableFields,
  advancedFilterableFields,
  normalFieldIdSet,
  sanitizedPinnedIds,
  sanitizedQuickAccessIds,
}: Pick<
  UseFilterBuilderDerivedStateOptions<T>,
  | 'fields'
  | 'activeFilterIdsState'
  | 'valuesState'
  | 'debouncedValuesState'
  | 'advancedRulesState'
  | 'normalFilterableFields'
  | 'advancedFilterableFields'
  | 'normalFieldIdSet'
  | 'sanitizedPinnedIds'
  | 'sanitizedQuickAccessIds'
>) => {
  const activeFilterIds = useMemo(
    () =>
      activeFilterIdsState.filter(
        (fieldId) =>
          normalFieldIdSet.has(fieldId) &&
          !sanitizedPinnedIds.includes(fieldId) &&
          !sanitizedQuickAccessIds.includes(fieldId),
      ),
    [
      activeFilterIdsState,
      normalFieldIdSet,
      sanitizedPinnedIds,
      sanitizedQuickAccessIds,
    ],
  );
  const values = useMemo(
    () => sanitizeValuesForFieldIds(valuesState, normalFieldIdSet),
    [valuesState, normalFieldIdSet],
  );
  const debouncedValues = useMemo(
    () => sanitizeValuesForFieldIds(debouncedValuesState, normalFieldIdSet),
    [debouncedValuesState, normalFieldIdSet],
  );
  const advancedRules = useMemo(
    () =>
      advancedRulesState
        .map((rule) => sanitizeAdvancedRule(fields, rule))
        .filter((rule): rule is AdvancedFilterRule => rule !== null),
    [advancedRulesState, fields],
  );
  const pinnedFields = useMemo(
    () => resolveFieldsByIds(sanitizedPinnedIds, normalFilterableFields),
    [sanitizedPinnedIds, normalFilterableFields],
  );
  const activeFields = useMemo(
    () => resolveFieldsByIds(activeFilterIds, normalFilterableFields),
    [activeFilterIds, normalFilterableFields],
  );
  const quickAccessFields = useMemo(
    () => resolveFieldsByIds(sanitizedQuickAccessIds, normalFilterableFields),
    [sanitizedQuickAccessIds, normalFilterableFields],
  );
  const availableFields = useMemo(
    () =>
      resolveAvailableFields(
        normalFilterableFields,
        activeFilterIds,
        sanitizedPinnedIds,
        sanitizedQuickAccessIds,
      ),
    [
      normalFilterableFields,
      activeFilterIds,
      sanitizedPinnedIds,
      sanitizedQuickAccessIds,
    ],
  );
  const activeNormalFilterIds = useMemo(
    () =>
      resolveActiveNormalFilterIds(
        sanitizedPinnedIds,
        sanitizedQuickAccessIds,
        activeFilterIds,
      ),
    [sanitizedPinnedIds, sanitizedQuickAccessIds, activeFilterIds],
  );

  return {
    activeFields,
    activeFilterIds,
    activeNormalFilterIds,
    advancedFilterableFields,
    advancedRules,
    availableFields,
    debouncedValues,
    pinnedFields,
    quickAccessFields,
    values,
  };
};

const useComputedFilterBuilderState = <T>({
  data,
  fields,
  activeNormalFilterIds,
  debouncedValues,
  advancedCombinatorState,
  advancedRules,
  activeFilterIds,
  defaultActiveFilterIds,
  values,
}: Pick<
  UseFilterBuilderDerivedStateOptions<T>,
  'data' | 'fields' | 'advancedCombinatorState' | 'defaultActiveFilterIds'
> & {
  activeFilterIds: string[];
  activeNormalFilterIds: string[];
  advancedRules: AdvancedFilterRule[];
  debouncedValues: Record<string, string>;
  values: Record<string, string>;
}) => {
  const model = useMemo<FilterModel>(
    () => ({
      normal: {
        activeFilterIds: activeNormalFilterIds,
        values: debouncedValues,
      },
      advanced: {
        combinator: advancedCombinatorState,
        rules: advancedRules,
      },
    }),
    [
      activeNormalFilterIds,
      debouncedValues,
      advancedCombinatorState,
      advancedRules,
    ],
  );
  const filteredData = useMemo(
    () => applyFilterModel(data, fields, model),
    [data, fields, model],
  );
  const ruleCount = advancedRules.length;
  const hasActiveNormalFilters = useMemo(
    () => hasActiveFilterValues(activeNormalFilterIds, values),
    [activeNormalFilterIds, values],
  );
  const hasConfiguredNormalFiltersState = useMemo(
    () => hasConfiguredNormalFilters(activeFilterIds, defaultActiveFilterIds),
    [activeFilterIds, defaultActiveFilterIds],
  );

  return {
    filteredData,
    hasActiveFilters:
      hasActiveNormalFilters ||
      hasConfiguredNormalFiltersState ||
      ruleCount > 0,
    ruleCount,
  };
};

export const useFilterBuilderDerivedState = <T>(
  options: UseFilterBuilderDerivedStateOptions<T>,
) => {
  const resolvedState = useResolvedFilterBuilderState(options);
  const computedState = useComputedFilterBuilderState({
    ...options,
    ...resolvedState,
  });

  return {
    ...resolvedState,
    ...computedState,
    advancedCombinator: options.advancedCombinatorState,
  };
};

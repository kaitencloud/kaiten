import type {
  AdvancedFilterRule,
  FilterCombinator,
  FilterFieldDefinition,
} from './filter.types';

export type AdvancedRulePatch = Partial<
  Pick<AdvancedFilterRule, 'fieldId' | 'operator' | 'value'>
>;

export type UseFilterBuilderProps<T> = {
  data: T[];
  fields: FilterFieldDefinition<T>[];
  pinnedFilterIds?: string[];
  quickAccessFilterIds?: string[];
  defaultNormalFilterIds?: string[];
  defaultAdvancedCombinator?: FilterCombinator;
  defaultAdvancedRules?: AdvancedFilterRule[];
  debounceMs?: number;
  resetOnDataChange?: boolean;
};

export type UseFilterBuilderResult<T> = {
  filteredData: T[];
  normal: {
    filterableFields: FilterFieldDefinition<T>[];
    pinnedFields: FilterFieldDefinition<T>[];
    pinnedFilterIds: string[];
    quickAccessFields: FilterFieldDefinition<T>[];
    quickAccessFilterIds: string[];
    activeFields: FilterFieldDefinition<T>[];
    availableFields: FilterFieldDefinition<T>[];
    activeFilterIds: string[];
    values: Record<string, string>;
    addFilter: (fieldId: string) => void;
    removeFilter: (fieldId: string) => void;
    setValue: (fieldId: string, value: string) => void;
  };
  advanced: {
    filterableFields: FilterFieldDefinition<T>[];
    combinator: FilterCombinator;
    setCombinator: (combinator: FilterCombinator) => void;
    rules: AdvancedFilterRule[];
    addRule: (fieldId?: string) => void;
    updateRule: (ruleId: string, patch: AdvancedRulePatch) => void;
    removeRule: (ruleId: string) => void;
    clearRules: () => void;
    ruleCount: number;
  };
  hasActiveFilters: boolean;
  resetAll: () => void;
};

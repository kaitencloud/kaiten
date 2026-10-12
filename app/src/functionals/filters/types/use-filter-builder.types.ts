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
  /**
   * Values the normal filters hold when the screen opens, by filter id: a link
   * that opens a list already narrowed (`?status=PUSH_FAILED`). A filter that has one is
   * active, and shown as a chip, even if it is not a default one. They are where
   * the state starts and not what it goes back to: `resetAll` clears them, and
   * a change of this prop does not touch filters already set.
   */
  initialNormalValues?: Record<string, string>;
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

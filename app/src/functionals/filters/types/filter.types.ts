export type FilterFieldType =
  | 'text'
  | 'enum'
  | 'enum_list'
  | 'boolean'
  | 'number'
  | 'date';

export type FilterOperator =
  | 'contains'
  | 'not_contains'
  | 'is'
  | 'is_not'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains_any'
  | 'contains_all';

export type FilterCombinator = 'and' | 'or';

export type FilterOption = {
  label: string;
  value: string;
};

export type FilterFieldDefinition<T> = {
  id: string;
  label: string;
  type: FilterFieldType;
  accessor: (item: T) => unknown;
  options?: FilterOption[];
  placeholder?: string;
  /**
   * For a field with options (enum, enum_list, boolean): shows a search box
   * above them. Off by default; worth it once the list is long enough to scan.
   */
  searchable?: boolean;
  quickAccess?: boolean;
  normalFilterable?: boolean;
  advancedFilterable?: boolean;
};

export type AdvancedFilterRule = {
  id: string;
  fieldId: string;
  operator: FilterOperator;
  value: string;
};

export type NormalFilterModel = {
  activeFilterIds: string[];
  values: Record<string, string>;
};

export type AdvancedFilterModel = {
  combinator: FilterCombinator;
  rules: AdvancedFilterRule[];
};

export type FilterModel = {
  normal: NormalFilterModel;
  advanced: AdvancedFilterModel;
};

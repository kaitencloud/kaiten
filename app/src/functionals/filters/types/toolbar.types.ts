import type { ReactNode } from 'react';
import type { UseFilterBuilderResult } from '../hooks/use-filter-builder';

export type FilterToolbarLabels = {
  filterBy: string;
  filtersButton: string;
  addFilter: string;
  reset: string;
  clearFilter: string;
  all: string;
  trueValue: string;
  falseValue: string;
  filterFieldPlaceholder: string;
  removeFilterForField: string;
  searchFilterBy: string;
  filterGroup: string;
  advancedFilter: string;
  advancedFilterTitle: string;
  where: string;
  addRule: string;
  deleteRule: string;
  clearRules: string;
  and: string;
  or: string;
  noFilterAvailable: string;
  noResult: string;
  /** "{{count}} selected", for a chip summing up a long multi-selection. */
  selectedCount: string;
};

export type FilterToolbarProps<T> = {
  controller: UseFilterBuilderResult<T>;
  className?: string;
  children?: ReactNode;
  labels?: Partial<FilterToolbarLabels>;
  showAdvancedOption?: boolean;
};

export type FilterToolbarProviderProps<T> = {
  controller: UseFilterBuilderResult<T>;
  labels?: Partial<FilterToolbarLabels>;
  showAdvancedOption?: boolean;
  children: ReactNode;
};

export type FilterToolbarContentProps = {
  className?: string;
  children?: ReactNode;
  showFilterButton?: boolean;
  filterButtonClassName?: string;
};

export type FilterToolbarContextValue<T> = {
  controller: UseFilterBuilderResult<T>;
  labels: FilterToolbarLabels;
  showAdvancedOption: boolean;
  filterMenuOpen: boolean;
  setFilterMenuOpen: (open: boolean) => void;
  addFilterOpen: boolean;
  setAddFilterOpen: (open: boolean) => void;
  advancedOpen: boolean;
  setAdvancedOpen: (open: boolean) => void;
  isFilterRowVisible: boolean;
  activeNormalCount: number;
  activeAdvancedCount: number;
  activeFilterCount: number;
  hasAvailableNormalFilters: boolean;
  canAddAdvancedFilter: boolean;
  canOpenFilterMenu: boolean;
  showFilterRow: boolean;
  showAddFilterButton: boolean;
  openNormalFilterId: string | null;
  setOpenNormalFilterId: (fieldId: string | null) => void;
  handleSelectFilter: (fieldId: string) => void;
  handleOpenAdvancedFromMenu: () => void;
  handleFilterButtonClick: () => void;
};

export type FilterToolbarUiState = {
  filterMenuOpen: boolean;
  addFilterOpen: boolean;
  advancedOpen: boolean;
  isFilterRowVisible: boolean;
  openNormalFilterId: string | null;
};

export type FilterSearchInputProps = {
  filterId: string;
  className?: string;
};

export type FilterToolbarFilterButtonProps = {
  className?: string;
};

export type FilterToolbarQuickAccessFiltersProps = {
  className?: string;
};

export type FilterToolbarFiltersRowProps = {
  className?: string;
};

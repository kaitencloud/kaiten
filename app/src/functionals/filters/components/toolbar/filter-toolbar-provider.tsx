import { createContext, use, useMemo } from 'react';
import { useFilterToolbarUiState } from '../../hooks/use-filter-toolbar-ui-state';
import type {
  FilterToolbarContextValue,
  FilterToolbarProviderProps,
} from '../../types/toolbar.types';
import { useResolvedFilterToolbarLabels } from './filter-toolbar-labels';

const FilterToolbarContext = createContext<
  FilterToolbarContextValue<unknown> | undefined
>(undefined);

export function useFilterToolbarContext<T>() {
  const context = use(FilterToolbarContext);

  if (!context) {
    throw new Error(
      'useFilterToolbarContext must be used within FilterToolbarProvider.',
    );
  }

  return context as FilterToolbarContextValue<T>;
}

export function FilterToolbarProvider<T>({
  controller,
  labels,
  showAdvancedOption = false,
  children,
}: FilterToolbarProviderProps<T>) {
  const resolvedLabels = useResolvedFilterToolbarLabels(labels);
  const uiState = useFilterToolbarUiState(controller, showAdvancedOption);

  const contextValue = useMemo(
    () => ({
      controller,
      labels: resolvedLabels,
      showAdvancedOption,
      ...uiState,
    }),
    [controller, resolvedLabels, showAdvancedOption, uiState],
  );

  return (
    <FilterToolbarContext.Provider
      value={contextValue as FilterToolbarContextValue<unknown>}
    >
      {children}
    </FilterToolbarContext.Provider>
  );
}

import type { FilterToolbarProps } from '../../types/toolbar.types';
import { FilterToolbarContent } from './filter-toolbar-content';
import { FilterToolbarProvider } from './filter-toolbar-provider';

export function FilterToolbar<T>({
  controller,
  className,
  children,
  labels,
  showAdvancedOption = true,
}: FilterToolbarProps<T>) {
  return (
    <FilterToolbarProvider
      controller={controller}
      labels={labels}
      showAdvancedOption={showAdvancedOption}
    >
      <FilterToolbarContent className={className}>
        {children}
      </FilterToolbarContent>
    </FilterToolbarProvider>
  );
}

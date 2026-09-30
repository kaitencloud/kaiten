import type { FilterSearchInputProps } from '../../types/toolbar.types';
import { FilterValueInput } from '../shared';
import { useFilterToolbarContext } from './filter-toolbar-provider';

export function FilterSearchInput({
  filterId,
  className,
}: FilterSearchInputProps) {
  const { controller, labels: copy } = useFilterToolbarContext<unknown>();
  const field = controller.normal.filterableFields.find(
    (candidate) => candidate.id === filterId,
  );

  if (!field) {
    return null;
  }

  return (
    <div className={className}>
      <FilterValueInput
        field={field}
        value={controller.normal.values[field.id] ?? ''}
        onValueChange={(value) => controller.normal.setValue(field.id, value)}
        labels={copy}
      />
    </div>
  );
}

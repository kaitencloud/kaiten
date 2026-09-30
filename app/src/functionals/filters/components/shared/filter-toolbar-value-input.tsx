import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FilterFieldDefinition } from '../../types/filter.types';
import type { FilterToolbarLabels } from '../../types/toolbar.types';
import { FilterMultiSelect } from './filter-multi-select';

const FILTER_VALUE_ALL = '__all__';

function renderEnumOption(option: { value: string; label: string }) {
  return (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  );
}

type FilterValueInputProps<T> = {
  field: FilterFieldDefinition<T>;
  value: string;
  onValueChange: (value: string) => void;
  labels: Pick<
    FilterToolbarLabels,
    'all' | 'falseValue' | 'filterBy' | 'filterFieldPlaceholder' | 'trueValue'
  >;
};

// A select filter shows its current value ("All") and a date input has no
// placeholder: neither says what it filters, so both are named "Filter by
// <field>". The prefix keeps a filter from reading like the form field of the
// same name in a dialog opened over the list. Text and number filters are
// named by their placeholder, which already says it.
export function FilterValueInput<T>({
  field,
  value,
  onValueChange,
  labels,
}: FilterValueInputProps<T>) {
  const controlLabel = `${labels.filterBy.replace(/\s*:\s*$/, '')} ${field.label}`;
  const textFieldPlaceholder = labels.filterFieldPlaceholder.replace(
    '{{field}}',
    field.label,
  );

  const enumOptions = field.options?.filter(
    (option) => option.value.length > 0,
  );

  if (field.type === 'enum_list' && enumOptions?.length) {
    return (
      <FilterMultiSelect
        options={enumOptions}
        value={value}
        onValueChange={onValueChange}
        placeholder={field.placeholder ?? field.label}
        emptyLabel={labels.all}
      />
    );
  }

  if (field.type === 'enum' && enumOptions?.length) {
    return (
      <Select
        value={value || FILTER_VALUE_ALL}
        onValueChange={(nextValue) =>
          onValueChange(nextValue === FILTER_VALUE_ALL ? '' : nextValue)
        }
      >
        <SelectTrigger className="w-full" aria-label={controlLabel}>
          <SelectValue placeholder={field.placeholder ?? field.label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FILTER_VALUE_ALL}>{labels.all}</SelectItem>
          {enumOptions.map(renderEnumOption)}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === 'boolean') {
    return (
      <Select
        value={value || FILTER_VALUE_ALL}
        onValueChange={(nextValue) =>
          onValueChange(nextValue === FILTER_VALUE_ALL ? '' : nextValue)
        }
      >
        <SelectTrigger className="w-full" aria-label={controlLabel}>
          <SelectValue placeholder={field.placeholder ?? field.label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FILTER_VALUE_ALL}>{labels.all}</SelectItem>
          <SelectItem value="true">{labels.trueValue}</SelectItem>
          <SelectItem value="false">{labels.falseValue}</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (field.type === 'date') {
    return (
      <Input
        type="date"
        aria-label={controlLabel}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    );
  }

  if (field.type === 'number') {
    return (
      <Input
        type="number"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={field.placeholder ?? field.label}
      />
    );
  }

  return (
    <div className="relative">
      <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
      <Input
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={field.placeholder ?? textFieldPlaceholder}
        className="pl-8"
      />
    </div>
  );
}

import { useId } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type FilterChoiceProps<T extends string> = {
  label: string;
  onChange: (value: T | undefined) => void;
  options: ReadonlyArray<{ label: string; value: T }>;
  /** The choice made; none reads as every option. */
  value: T | undefined;
};

/**
 * One choice among a few, as a row of buttons: pressing the one that is pressed
 * takes the filter off, so that "all" needs no option of its own. The group is
 * named by its label.
 */
export function FilterChoice<T extends string>({
  label,
  onChange,
  options,
  value,
}: FilterChoiceProps<T>) {
  const labelId = useId();

  function renderOption(option: { label: string; value: T }) {
    return (
      <ToggleGroupItem key={option.value} value={option.value}>
        {option.label}
      </ToggleGroupItem>
    );
  }

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground" id={labelId}>
        {label}
      </span>
      <ToggleGroup
        aria-labelledby={labelId}
        className="flex-wrap"
        onValueChange={(next) => onChange(next[0] as T | undefined)}
        size="sm"
        spacing={1}
        value={value === undefined ? [] : [value]}
        variant="outline"
      >
        {options.map(renderOption)}
      </ToggleGroup>
    </div>
  );
}

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type SelectOption = {
  label: string;
  value: string;
};

export function OptionSelect({
  allLabel,
  ariaLabel,
  includeAllOption = false,
  onChange,
  options,
  triggerClassName,
  value,
}: {
  allLabel?: string;
  ariaLabel: string;
  includeAllOption?: boolean;
  onChange: (value: string) => void;
  options: SelectOption[];
  triggerClassName?: string;
  value: string;
}) {
  return (
    <Select
      items={[
        ...(includeAllOption && allLabel
          ? [{ value: 'all', label: allLabel }]
          : []),
        ...options,
      ]}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger
        className={cn('w-full min-w-[220px] md:w-[220px]', triggerClassName)}
        aria-label={ariaLabel}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {includeAllOption && allLabel ? (
          <SelectItem value="all">{allLabel}</SelectItem>
        ) : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

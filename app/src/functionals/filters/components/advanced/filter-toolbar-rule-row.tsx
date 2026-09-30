import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FILTER_OPERATOR_LABELS,
  getOperatorsForFieldType,
} from '../../logic/filter-logic';
import type {
  AdvancedFilterRule,
  FilterFieldDefinition,
  FilterOperator,
} from '../../types/filter.types';
import type { FilterToolbarLabels } from '../../types/toolbar.types';
import { FilterValueInput } from '../shared';

type RuleRowProps<T> = {
  rule: AdvancedFilterRule;
  fields: FilterFieldDefinition<T>[];
  labels: Pick<
    FilterToolbarLabels,
    | 'all'
    | 'deleteRule'
    | 'falseValue'
    | 'filterBy'
    | 'filterFieldPlaceholder'
    | 'trueValue'
  >;
  whereLabel: string;
  onUpdate: (patch: Partial<AdvancedFilterRule>) => void;
  onDelete: () => void;
};

function renderFieldOption(option: { id: string; label: string }) {
  return (
    <SelectItem key={option.id} value={option.id}>
      {option.label}
    </SelectItem>
  );
}

function renderOperatorOption(operator: FilterOperator) {
  return (
    <SelectItem key={operator} value={operator}>
      {FILTER_OPERATOR_LABELS[operator]}
    </SelectItem>
  );
}

export function RuleRow<T>({
  rule,
  fields,
  labels,
  whereLabel,
  onUpdate,
  onDelete,
}: RuleRowProps<T>) {
  const field =
    fields.find((candidate) => candidate.id === rule.fieldId) ?? fields[0];
  if (!field) {
    return null;
  }

  const operators = getOperatorsForFieldType(field.type);

  return (
    <div className="border-border bg-background grid gap-2 rounded-md border p-3 md:grid-cols-[72px_1fr_1fr_2fr_auto] md:items-center">
      <span className="text-muted-foreground text-sm font-medium">
        {whereLabel}
      </span>

      <Select
        value={rule.fieldId}
        onValueChange={(fieldId) => onUpdate({ fieldId })}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{fields.map(renderFieldOption)}</SelectContent>
      </Select>

      <Select
        value={rule.operator}
        onValueChange={(operator) =>
          onUpdate({ operator: operator as FilterOperator })
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{operators.map(renderOperatorOption)}</SelectContent>
      </Select>

      <FilterValueInput
        field={field}
        value={rule.value}
        onValueChange={(nextValue) => onUpdate({ value: nextValue })}
        labels={labels}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={labels.deleteRule}
        onClick={onDelete}
        className="justify-self-end"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

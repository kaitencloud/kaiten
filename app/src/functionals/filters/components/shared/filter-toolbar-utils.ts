import {
  CalendarDays,
  CheckSquare2,
  Hash,
  ListFilter,
  TextCursorInput,
} from 'lucide-react';
import { FILTER_MULTI_SELECT_SEPARATOR } from '../../constants';
import {
  FILTER_OPERATOR_LABELS,
  getDefaultOperatorForFieldType,
} from '../../logic/filter-logic';
import type {
  FilterFieldDefinition,
  FilterFieldType,
  FilterOption,
} from '../../types/filter.types';
import type { FilterToolbarLabels } from '../../types/toolbar.types';

export function getFieldIcon(type: FilterFieldType) {
  if (type === 'text') {
    return TextCursorInput;
  }
  if (type === 'enum' || type === 'enum_list') {
    return ListFilter;
  }
  if (type === 'boolean') {
    return CheckSquare2;
  }
  if (type === 'number') {
    return Hash;
  }

  return CalendarDays;
}

function formatFilterValue<T>(field: FilterFieldDefinition<T>, value: string) {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return '';
  }

  if (field.type === 'enum' && field.options?.length) {
    const option = field.options.find(
      (candidate) =>
        candidate.value.toLowerCase() === normalizedValue.toLowerCase(),
    );
    return option?.label ?? normalizedValue;
  }

  if (field.type === 'enum_list' && field.options?.length) {
    // Selection is stored as US-separated values — see FilterMultiSelect.
    // Display uses `, ` for human readability.
    const picked = normalizedValue
      .split(FILTER_MULTI_SELECT_SEPARATOR)
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length > 0);
    if (picked.length === 0) return '';
    const labels = picked.map((v) => {
      const option = field.options?.find(
        (candidate) => candidate.value.toLowerCase() === v,
      );
      return option?.label ?? v;
    });
    return labels.join(', ');
  }

  if (field.type === 'boolean') {
    if (normalizedValue.toLowerCase() === 'true') {
      return 'true';
    }
    if (normalizedValue.toLowerCase() === 'false') {
      return 'false';
    }
  }

  return normalizedValue;
}

/**
 * Whether a field is filtered by picking from a list: enum and enum_list fields
 * that have options, and booleans. Their editor opens straight onto the list
 * (FilterOptionList); every other field keeps its value input.
 */
export function hasOptionList<T>(field: FilterFieldDefinition<T>): boolean {
  if (field.type === 'boolean') {
    return true;
  }

  return (
    (field.type === 'enum' || field.type === 'enum_list') &&
    (field.options?.some((option) => option.value.length > 0) ?? false)
  );
}

/** What a field offers to pick: its own options, or true/false for a boolean. */
export function getFieldOptions<T>(
  field: FilterFieldDefinition<T>,
  labels: Pick<FilterToolbarLabels, 'falseValue' | 'trueValue'>,
): FilterOption[] {
  if (field.type === 'boolean') {
    return [
      { value: 'true', label: labels.trueValue },
      { value: 'false', label: labels.falseValue },
    ];
  }

  return field.options?.filter((option) => option.value.length > 0) ?? [];
}

/**
 * The values a filter holds: at most one for enum and boolean, any number for
 * enum_list, whose selection is stored separator-delimited.
 */
export function parseFilterValues<T>(
  field: FilterFieldDefinition<T>,
  value: string,
): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  if (field.type !== 'enum_list') {
    return [trimmed];
  }

  return trimmed
    .split(FILTER_MULTI_SELECT_SEPARATOR)
    .map((selected) => selected.trim())
    .filter((selected) => selected.length > 0);
}

export function getFilterBadgeLabel<T>(
  field: FilterFieldDefinition<T>,
  value: string,
  labels: Pick<
    FilterToolbarLabels,
    'falseValue' | 'selectedCount' | 'trueValue'
  >,
) {
  // A field picked from a list reads "Label: value". Its operator ("is",
  // "contains any of") is the only one it has, so spelling it out is noise.
  if (hasOptionList(field)) {
    const options = getFieldOptions(field, labels);
    const picked = parseFilterValues(field, value).map(
      (selected) =>
        options.find(
          (option) => option.value.toLowerCase() === selected.toLowerCase(),
        )?.label ?? selected,
    );
    if (picked.length === 0) {
      return field.label;
    }

    const summary =
      picked.length > 2
        ? labels.selectedCount.replace('{{count}}', String(picked.length))
        : picked.join(', ');

    return `${field.label}: ${summary}`;
  }

  const formattedValue = formatFilterValue(field, value);
  if (!formattedValue) {
    return field.label;
  }

  const defaultOperator = getDefaultOperatorForFieldType(field.type);
  const operatorLabel = FILTER_OPERATOR_LABELS[defaultOperator];

  return `${field.label} ${operatorLabel} ${formattedValue}`;
}

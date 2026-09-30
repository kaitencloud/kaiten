import type { FilterFieldType, FilterOperator } from '../types/filter.types';

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: 'contains',
  not_contains: 'does not contain',
  is: 'is',
  is_not: 'is not',
  starts_with: 'starts with',
  ends_with: 'ends with',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  // enum_list (multi-select) operators.
  // `contains_any` = the field's array intersects the user's selection.
  // `contains_all` = the field's array is a superset of the user's selection.
  contains_any: 'contains any of',
  contains_all: 'contains all of',
};

const FILTER_OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  text: [
    'contains',
    'not_contains',
    'is',
    'is_not',
    'starts_with',
    'ends_with',
  ],
  enum: ['is', 'is_not', 'contains', 'not_contains'],
  enum_list: ['contains_any', 'contains_all'],
  boolean: ['is', 'is_not'],
  number: ['is', 'is_not', 'gt', 'gte', 'lt', 'lte'],
  date: ['is', 'is_not', 'gt', 'gte', 'lt', 'lte'],
};

export const getOperatorsForFieldType = (
  fieldType: FilterFieldType,
): FilterOperator[] => FILTER_OPERATORS_BY_TYPE[fieldType];

export const getDefaultOperatorForFieldType = (
  fieldType: FilterFieldType,
): FilterOperator => {
  if (fieldType === 'text') return 'contains';
  if (fieldType === 'enum_list') return 'contains_any';
  return 'is';
};

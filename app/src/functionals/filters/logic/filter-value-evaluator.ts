import { FILTER_MULTI_SELECT_SEPARATOR } from '../constants';
import type { FilterFieldType, FilterOperator } from '../types/filter.types';

const normalizeString = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const parseNumber = (value: unknown): number | null => {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseDate = (value: unknown): number | null => {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }

  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = normalizeString(value);
  if (normalized === 'true' || normalized === '1') {
    return true;
  }

  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  return null;
};

const compareAsString = (
  fieldValue: unknown,
  operator: FilterOperator,
  filterValue: string,
): boolean => {
  const right = normalizeString(filterValue);
  if (!right) {
    return true;
  }

  if (Array.isArray(fieldValue)) {
    const values = fieldValue.flatMap((value) => {
      const normalized = normalizeString(value);
      return normalized.length > 0 ? [normalized] : [];
    });

    if (values.length === 0) {
      return operator === 'is_not' || operator === 'not_contains';
    }

    switch (operator) {
      case 'contains':
        return values.some((value) => value.includes(right));
      case 'not_contains':
        return values.every((value) => !value.includes(right));
      case 'is':
        return values.some((value) => value === right);
      case 'is_not':
        return values.every((value) => value !== right);
      case 'starts_with':
        return values.some((value) => value.startsWith(right));
      case 'ends_with':
        return values.some((value) => value.endsWith(right));
      default:
        return values.some((value) => value.includes(right));
    }
  }

  const left = normalizeString(fieldValue);
  switch (operator) {
    case 'contains':
      return left.includes(right);
    case 'not_contains':
      return !left.includes(right);
    case 'is':
      return left === right;
    case 'is_not':
      return left !== right;
    case 'starts_with':
      return left.startsWith(right);
    case 'ends_with':
      return left.endsWith(right);
    default:
      return left.includes(right);
  }
};

const compareAsNumber = (
  fieldValue: unknown,
  operator: FilterOperator,
  filterValue: string,
): boolean => {
  const left = parseNumber(fieldValue);
  const right = parseNumber(filterValue);
  if (left === null || right === null) {
    return false;
  }

  switch (operator) {
    case 'is':
      return left === right;
    case 'is_not':
      return left !== right;
    case 'gt':
      return left > right;
    case 'gte':
      return left >= right;
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
    default:
      return left === right;
  }
};

const compareAsDate = (
  fieldValue: unknown,
  operator: FilterOperator,
  filterValue: string,
): boolean => {
  const left = parseDate(fieldValue);
  const right = parseDate(filterValue);
  if (left === null || right === null) {
    return false;
  }

  switch (operator) {
    case 'is':
      return left === right;
    case 'is_not':
      return left !== right;
    case 'gt':
      return left > right;
    case 'gte':
      return left >= right;
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
    default:
      return left === right;
  }
};

const compareAsBoolean = (
  fieldValue: unknown,
  operator: FilterOperator,
  filterValue: string,
): boolean => {
  const left = parseBoolean(fieldValue);
  const right = parseBoolean(filterValue);
  if (left === null || right === null) {
    return false;
  }

  switch (operator) {
    case 'is':
      return left === right;
    case 'is_not':
      return left !== right;
    default:
      return left === right;
  }
};

// enum_list values are serialized as a separator-delimited string when stored
// in the FilterModel (one selection per field, ASCII Unit Separator `\x1F`).
// US instead of `,` keeps user-facing enum labels safe even if they contain
// commas. Empty entries are dropped to tolerate trailing/leading separators.
// The separator is the shared `FILTER_MULTI_SELECT_SEPARATOR` from
// `../constants` (imported above) — one source of truth across layers.
const parseFilterSelection = (filterValue: string): string[] =>
  filterValue.split(FILTER_MULTI_SELECT_SEPARATOR).flatMap((value) => {
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? [trimmed] : [];
  });

const toStringArray = (fieldValue: unknown): string[] => {
  if (Array.isArray(fieldValue)) {
    return fieldValue.flatMap((value) => {
      const normalized = normalizeString(value);
      return normalized.length > 0 ? [normalized] : [];
    });
  }
  const single = normalizeString(fieldValue);
  return single ? [single] : [];
};

const compareAsEnumList = (
  fieldValue: unknown,
  operator: FilterOperator,
  filterValue: string,
): boolean => {
  const selection = parseFilterSelection(filterValue);
  if (selection.length === 0) {
    return true; // empty selection ⇒ no filter applied
  }

  const actual = toStringArray(fieldValue);
  switch (operator) {
    case 'contains_any':
      return selection.some((picked) => actual.includes(picked));
    case 'contains_all':
      return selection.every((picked) => actual.includes(picked));
    default:
      // Fall back to string comparison for any non-enum_list operator hitting
      // this branch (e.g. a stale rule before a type migration).
      return compareAsString(fieldValue, operator, filterValue);
  }
};

export const evaluateFieldValue = (
  fieldType: FilterFieldType,
  fieldValue: unknown,
  operator: FilterOperator,
  filterValue: string,
): boolean => {
  if (!filterValue.trim()) {
    return true;
  }

  switch (fieldType) {
    case 'number':
      return compareAsNumber(fieldValue, operator, filterValue);
    case 'date':
      return compareAsDate(fieldValue, operator, filterValue);
    case 'boolean':
      return compareAsBoolean(fieldValue, operator, filterValue);
    case 'enum_list':
      return compareAsEnumList(fieldValue, operator, filterValue);
    default:
      return compareAsString(fieldValue, operator, filterValue);
  }
};

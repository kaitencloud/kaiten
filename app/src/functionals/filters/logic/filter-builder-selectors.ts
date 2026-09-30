import type { FilterFieldDefinition } from '../types/filter.types';

export const resolveFieldIdSet = <T>(
  fields: FilterFieldDefinition<T>[],
): Set<string> => new Set(fields.map((field) => field.id));

export const resolveFieldsByIds = <T>(
  fieldIds: string[],
  fields: FilterFieldDefinition<T>[],
): FilterFieldDefinition<T>[] =>
  fieldIds
    .map((fieldId) => fields.find((field) => field.id === fieldId))
    .filter((field): field is FilterFieldDefinition<T> => Boolean(field));

export const resolveAvailableFields = <T>(
  fields: FilterFieldDefinition<T>[],
  activeFilterIds: string[],
  pinnedFilterIds: string[],
  quickAccessFilterIds: string[],
): FilterFieldDefinition<T>[] =>
  fields.filter(
    (field) =>
      !activeFilterIds.includes(field.id) &&
      !pinnedFilterIds.includes(field.id) &&
      !quickAccessFilterIds.includes(field.id),
  );

export const resolveActiveNormalFilterIds = (
  pinnedFilterIds: string[],
  quickAccessFilterIds: string[],
  activeFilterIds: string[],
): string[] => [
  ...pinnedFilterIds,
  ...quickAccessFilterIds,
  ...activeFilterIds,
];

export const hasActiveFilterValues = (
  activeFilterIds: string[],
  values: Record<string, string>,
): boolean =>
  activeFilterIds.some((fieldId) => (values[fieldId] ?? '').trim().length > 0);

export const hasConfiguredNormalFilters = (
  activeFilterIds: string[],
  defaultActiveFilterIds: string[],
): boolean => {
  if (activeFilterIds.length !== defaultActiveFilterIds.length) {
    return true;
  }

  return activeFilterIds.some(
    (fieldId) => !defaultActiveFilterIds.includes(fieldId),
  );
};

import { useMemo } from 'react';
import {
  sanitizeAdvancedRule,
  sanitizeDefaultNormalFilters,
  sanitizeInitialValues,
  sanitizePinnedFilters,
  sanitizeQuickAccessFilters,
} from '../logic/filter-builder-defaults';
import { resolveFieldIdSet } from '../logic/filter-builder-selectors';
import type { UseFilterBuilderProps } from '../types/use-filter-builder.types';

export const useFilterBuilderConfig = <T>({
  fields,
  defaultAdvancedRules,
  defaultNormalFilterIds,
  initialNormalValues,
  pinnedFilterIds,
  quickAccessFilterIds,
}: Pick<
  UseFilterBuilderProps<T>,
  | 'fields'
  | 'defaultAdvancedRules'
  | 'defaultNormalFilterIds'
  | 'initialNormalValues'
  | 'pinnedFilterIds'
  | 'quickAccessFilterIds'
>) => {
  const sanitizedDefaultNormalIds = useMemo(
    () => sanitizeDefaultNormalFilters(defaultNormalFilterIds, fields),
    [defaultNormalFilterIds, fields],
  );
  const sanitizedPinnedIds = useMemo(
    () => sanitizePinnedFilters(pinnedFilterIds, fields),
    [pinnedFilterIds, fields],
  );
  const sanitizedQuickAccessIds = useMemo(() => {
    const quickAccessFromFields = fields.flatMap((field) =>
      field.quickAccess === true && field.normalFilterable !== false
        ? [field.id]
        : [],
    );
    const quickAccessFromProps = sanitizeQuickAccessFilters(
      quickAccessFilterIds,
      fields,
    );

    return [
      ...new Set([...quickAccessFromFields, ...quickAccessFromProps]),
    ].filter((fieldId) => !sanitizedPinnedIds.includes(fieldId));
  }, [fields, quickAccessFilterIds, sanitizedPinnedIds]);
  const sanitizedDefaultAdvancedRules = useMemo(
    () =>
      (defaultAdvancedRules ?? []).flatMap((rule) => {
        const sanitized = sanitizeAdvancedRule(fields, rule);
        return sanitized !== null ? [sanitized] : [];
      }),
    [defaultAdvancedRules, fields],
  );
  const defaultActiveFilterIds = useMemo(
    () =>
      sanitizedDefaultNormalIds.filter(
        (fieldId) =>
          !sanitizedPinnedIds.includes(fieldId) &&
          !sanitizedQuickAccessIds.includes(fieldId),
      ),
    [sanitizedDefaultNormalIds, sanitizedPinnedIds, sanitizedQuickAccessIds],
  );
  const normalFilterableFields = useMemo(
    () => fields.filter((field) => field.normalFilterable !== false),
    [fields],
  );
  const advancedFilterableFields = useMemo(
    () => fields.filter((field) => field.advancedFilterable !== false),
    [fields],
  );
  const normalFieldIdSet = useMemo(
    () => resolveFieldIdSet(normalFilterableFields),
    [normalFilterableFields],
  );
  const sanitizedInitialValues = useMemo(
    () => sanitizeInitialValues(initialNormalValues, normalFieldIdSet),
    [initialNormalValues, normalFieldIdSet],
  );
  const alwaysShownIds = useMemo(
    () => [...sanitizedPinnedIds, ...sanitizedQuickAccessIds],
    [sanitizedPinnedIds, sanitizedQuickAccessIds],
  );

  return {
    advancedFilterableFields,
    alwaysShownIds,
    defaultActiveFilterIds,
    normalFieldIdSet,
    normalFilterableFields,
    sanitizedDefaultAdvancedRules,
    sanitizedInitialValues,
    sanitizedPinnedIds,
    sanitizedQuickAccessIds,
  };
};

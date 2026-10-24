import type {
  AdvancedFilterRule,
  FilterCombinator,
  FilterFieldDefinition,
  FilterOperator,
} from '../types/filter.types';
import type { AdvancedRulePatch } from '../types/use-filter-builder.types';
import {
  getDefaultOperatorForFieldType,
  getOperatorsForFieldType,
} from './filter-logic';

export const DEFAULT_DEBOUNCE_MS = 200;

const createRuleId = (): string =>
  `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const sanitizeFilterIds = <T>(
  fieldIds: string[] | undefined,
  fields: FilterFieldDefinition<T>[],
): string[] => {
  if (!fieldIds || fieldIds.length === 0) {
    return [];
  }

  const normalFieldIds = new Set(
    fields.flatMap((field) =>
      field.normalFilterable !== false ? [field.id] : [],
    ),
  );

  return fieldIds.filter((fieldId) => normalFieldIds.has(fieldId));
};

export const sanitizeDefaultNormalFilters = sanitizeFilterIds;
export const sanitizePinnedFilters = sanitizeFilterIds;
export const sanitizeQuickAccessFilters = sanitizeFilterIds;

export const createAdvancedRule = <T>(
  fields: FilterFieldDefinition<T>[],
  fieldId?: string,
): AdvancedFilterRule | null => {
  const advancedFields = fields.filter(
    (field) => field.advancedFilterable !== false,
  );
  if (advancedFields.length === 0) {
    return null;
  }

  const selectedField =
    advancedFields.find((field) => field.id === fieldId) ?? advancedFields[0];

  return {
    id: createRuleId(),
    fieldId: selectedField.id,
    operator: getDefaultOperatorForFieldType(selectedField.type),
    value: '',
  };
};

export const sanitizeAdvancedRule = <T>(
  fields: FilterFieldDefinition<T>[],
  rule: AdvancedFilterRule,
): AdvancedFilterRule | null => {
  const field = fields.find(
    (candidate) =>
      candidate.id === rule.fieldId && candidate.advancedFilterable !== false,
  );
  if (!field) {
    return null;
  }

  const operators = getOperatorsForFieldType(field.type);
  const operator = operators.includes(rule.operator)
    ? rule.operator
    : getDefaultOperatorForFieldType(field.type);

  return {
    ...rule,
    operator,
  };
};

export const sanitizeValuesForFieldIds = (
  values: Record<string, string>,
  allowedFieldIds: Set<string>,
): Record<string, string> => {
  const sanitized: Record<string, string> = {};
  for (const [fieldId, fieldValue] of Object.entries(values)) {
    if (allowedFieldIds.has(fieldId)) {
      sanitized[fieldId] = fieldValue;
    }
  }

  return sanitized;
};

const resolveRuleOperator = <T>(
  fields: FilterFieldDefinition<T>[],
  fieldId: string,
  operator: FilterOperator,
): FilterOperator => {
  const field = fields.find((candidate) => candidate.id === fieldId);
  if (!field) {
    return operator;
  }

  const allowedOperators = getOperatorsForFieldType(field.type);
  return allowedOperators.includes(operator)
    ? operator
    : getDefaultOperatorForFieldType(field.type);
};

export const patchAdvancedRule = <T>(
  rule: AdvancedFilterRule,
  patch: AdvancedRulePatch,
  fields: FilterFieldDefinition<T>[],
): AdvancedFilterRule => {
  const nextRule = {
    ...rule,
    ...patch,
  };

  if (patch.fieldId) {
    const field = fields.find((candidate) => candidate.id === patch.fieldId);
    if (!field) {
      return rule;
    }

    nextRule.operator = resolveRuleOperator(
      fields,
      patch.fieldId,
      nextRule.operator,
    );
    return nextRule;
  }

  if (patch.operator && !Object.hasOwn(patch, 'value')) {
    nextRule.operator = resolveRuleOperator(
      fields,
      nextRule.fieldId,
      patch.operator,
    );
  }

  return nextRule;
};

export const createResetState = (
  activeFilterIds: string[],
  advancedRules: AdvancedFilterRule[],
  advancedCombinator: FilterCombinator,
) => ({
  activeFilterIds,
  values: {},
  debouncedValues: {},
  advancedRules,
  advancedCombinator,
});

/**
 * The values a screen opens with, kept for the normal filters that exist and that
 * say something: a value that names no filter, or says nothing, is dropped.
 */
export const sanitizeInitialValues = (
  values: Record<string, string> | undefined,
  allowedFieldIds: Set<string>,
): Record<string, string> =>
  sanitizeValuesForFieldIds(
    Object.fromEntries(
      Object.entries(values ?? {}).filter(([, value]) => value.trim() !== ''),
    ),
    allowedFieldIds,
  );

/**
 * The state a filter builder is created in: the reset state, with the values the
 * screen opens with, and the filters that hold one active so that they show. The
 * pinned and quick access filters are always shown, so they need no id.
 */
export const createInitialState = (
  activeFilterIds: string[],
  initialValues: Record<string, string>,
  alwaysShownIds: string[],
  advancedRules: AdvancedFilterRule[],
  advancedCombinator: FilterCombinator,
) => ({
  ...createResetState(
    [
      ...new Set([
        ...activeFilterIds,
        ...Object.keys(initialValues).filter(
          (fieldId) => !alwaysShownIds.includes(fieldId),
        ),
      ]),
    ],
    advancedRules,
    advancedCombinator,
  ),
  debouncedValues: initialValues,
  values: initialValues,
});

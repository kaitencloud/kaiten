import { evaluateFieldValue } from './filter-value-evaluator';

export {
  FILTER_OPERATOR_LABELS,
  getDefaultOperatorForFieldType,
  getOperatorsForFieldType,
} from './filter-operator-config';

import type {
  AdvancedFilterRule,
  FilterCombinator,
  FilterFieldDefinition,
  FilterModel,
} from '../types/filter.types';
import { getDefaultOperatorForFieldType } from './filter-operator-config';

const buildFieldMap = <T>(
  fields: FilterFieldDefinition<T>[],
): Map<string, FilterFieldDefinition<T>> => {
  return new Map(fields.map((field) => [field.id, field]));
};

export const isAdvancedRuleComplete = (rule: AdvancedFilterRule): boolean => {
  return rule.value.trim().length > 0;
};

const evaluateAdvancedRules = <T>(
  item: T,
  fieldsById: Map<string, FilterFieldDefinition<T>>,
  rules: AdvancedFilterRule[],
  combinator: FilterCombinator,
): boolean => {
  const applicableRules = rules.filter((rule) => {
    return fieldsById.has(rule.fieldId) && isAdvancedRuleComplete(rule);
  });

  if (applicableRules.length === 0) {
    return true;
  }

  const evaluator = (rule: AdvancedFilterRule): boolean => {
    const field = fieldsById.get(rule.fieldId);
    if (!field) {
      return true;
    }

    return evaluateFieldValue(
      field.type,
      field.accessor(item),
      rule.operator,
      rule.value,
    );
  };

  if (combinator === 'or') {
    return applicableRules.some(evaluator);
  }

  return applicableRules.every(evaluator);
};

const evaluateNormalFilters = <T>(
  item: T,
  fieldsById: Map<string, FilterFieldDefinition<T>>,
  activeFilterIds: string[],
  values: Record<string, string>,
): boolean => {
  for (const filterId of activeFilterIds) {
    const field = fieldsById.get(filterId);
    if (!field) {
      continue;
    }

    const filterValue = values[filterId] ?? '';
    if (!filterValue.trim()) {
      continue;
    }

    const operator = getDefaultOperatorForFieldType(field.type);
    const matched = evaluateFieldValue(
      field.type,
      field.accessor(item),
      operator,
      filterValue,
    );

    if (!matched) {
      return false;
    }
  }

  return true;
};

export const applyFilterModel = <T>(
  data: T[],
  fields: FilterFieldDefinition<T>[],
  model: FilterModel,
): T[] => {
  const fieldsById = buildFieldMap(fields);

  return data.filter((item) => {
    const normalMatched = evaluateNormalFilters(
      item,
      fieldsById,
      model.normal.activeFilterIds,
      model.normal.values,
    );
    if (!normalMatched) {
      return false;
    }

    return evaluateAdvancedRules(
      item,
      fieldsById,
      model.advanced.rules,
      model.advanced.combinator,
    );
  });
};

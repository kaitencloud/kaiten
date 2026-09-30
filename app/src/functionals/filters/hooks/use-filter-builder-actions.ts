import { useCallback } from 'react';
import {
  createAdvancedRule,
  createResetState,
  patchAdvancedRule,
} from '../logic/filter-builder-defaults';
import type { FilterBuilderStoreActions } from '../store/filter-builder-store';
import type {
  AdvancedFilterRule,
  FilterCombinator,
  FilterFieldDefinition,
} from '../types/filter.types';
import type { AdvancedRulePatch } from '../types/use-filter-builder.types';

type UseFilterBuilderActionsOptions<T> = {
  actions: FilterBuilderStoreActions;
  fields: FilterFieldDefinition<T>[];
  advancedFilterableFields: FilterFieldDefinition<T>[];
  normalFieldIdSet: Set<string>;
  sanitizedPinnedIds: string[];
  sanitizedQuickAccessIds: string[];
  syncDebouncedValues: {
    (nextValues: Record<string, string>): void;
    cancel: () => void;
  };
  defaultActiveFilterIds: string[];
  sanitizedDefaultAdvancedRules: AdvancedFilterRule[];
  defaultAdvancedCombinator: FilterCombinator;
};

export const useFilterBuilderActions = <T>({
  actions,
  fields,
  advancedFilterableFields,
  normalFieldIdSet,
  sanitizedPinnedIds,
  sanitizedQuickAccessIds,
  syncDebouncedValues,
  defaultActiveFilterIds,
  sanitizedDefaultAdvancedRules,
  defaultAdvancedCombinator,
}: UseFilterBuilderActionsOptions<T>) => {
  const addFilter = useCallback(
    (fieldId: string) => {
      if (
        !normalFieldIdSet.has(fieldId) ||
        sanitizedPinnedIds.includes(fieldId) ||
        sanitizedQuickAccessIds.includes(fieldId)
      ) {
        return;
      }

      actions.setActiveFilterIds((current) =>
        current.includes(fieldId) ? current : [...current, fieldId],
      );
    },
    [actions, normalFieldIdSet, sanitizedPinnedIds, sanitizedQuickAccessIds],
  );
  const removeFilter = useCallback(
    (fieldId: string) => {
      if (sanitizedQuickAccessIds.includes(fieldId)) {
        return;
      }

      actions.setActiveFilterIds((current) =>
        current.includes(fieldId)
          ? current.filter((id) => id !== fieldId)
          : current,
      );
      actions.setValues((current) => {
        if (!Object.hasOwn(current, fieldId)) {
          return current;
        }

        const next = { ...current };
        delete next[fieldId];
        syncDebouncedValues(next);
        return next;
      });
    },
    [actions, sanitizedQuickAccessIds, syncDebouncedValues],
  );
  const setValue = useCallback(
    (fieldId: string, value: string) => {
      actions.setValues((current) => {
        if (current[fieldId] === value) {
          return current;
        }

        const next = { ...current, [fieldId]: value };
        syncDebouncedValues(next);
        return next;
      });
    },
    [actions, syncDebouncedValues],
  );
  const addRule = useCallback(
    (fieldId?: string) => {
      actions.setAdvancedRules((current) => {
        const rule = createAdvancedRule(fields, fieldId);
        return rule ? [...current, rule] : current;
      });
    },
    [actions, fields],
  );
  const updateRule = useCallback(
    (ruleId: string, patch: AdvancedRulePatch) => {
      actions.setAdvancedRules((current) =>
        current.map((rule) =>
          rule.id === ruleId
            ? patchAdvancedRule(rule, patch, advancedFilterableFields)
            : rule,
        ),
      );
    },
    [actions, advancedFilterableFields],
  );
  const removeRule = useCallback(
    (ruleId: string) => {
      actions.setAdvancedRules((current) =>
        current.filter((rule) => rule.id !== ruleId),
      );
    },
    [actions],
  );
  const clearRules = useCallback(() => {
    actions.setAdvancedRules([]);
  }, [actions]);
  const resetAll = useCallback(() => {
    syncDebouncedValues.cancel();
    actions.resetState(
      createResetState(
        defaultActiveFilterIds,
        sanitizedDefaultAdvancedRules,
        defaultAdvancedCombinator,
      ),
    );
  }, [
    actions,
    defaultActiveFilterIds,
    sanitizedDefaultAdvancedRules,
    defaultAdvancedCombinator,
    syncDebouncedValues,
  ]);

  return {
    addFilter,
    addRule,
    clearRules,
    removeFilter,
    removeRule,
    resetAll,
    setValue,
    updateRule,
  };
};

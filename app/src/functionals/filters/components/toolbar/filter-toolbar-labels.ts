import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FilterToolbarLabels } from '../../types/toolbar.types';

export function useResolvedFilterToolbarLabels(
  labels?: Partial<FilterToolbarLabels>,
) {
  const { t } = useTranslation();

  return useMemo(
    () => ({
      filterBy: t('Common.filterBy'),
      filtersButton: t('Common.filter'),
      addFilter: t('Common.addFilter'),
      reset: t('Common.reset'),
      clearFilter: t('Common.clearFilter'),
      all: t('Common.all'),
      trueValue: t('Common.trueValue'),
      falseValue: t('Common.falseValue'),
      filterFieldPlaceholder: t('Common.filterFieldPlaceholder'),
      removeFilterForField: t('Common.removeFilterForField'),
      searchFilterBy: t('Common.filterBy'),
      filterGroup: t('Common.filter'),
      advancedFilter: t('Common.advancedFilter'),
      advancedFilterTitle: t('Common.advancedFilter'),
      where: t('Common.where'),
      addRule: t('Common.addRule'),
      deleteRule: t('Common.deleteRule'),
      clearRules: t('Common.clearRules'),
      and: t('Common.and'),
      or: t('Common.or'),
      noFilterAvailable: t('Common.noFilterAvailable'),
      noResult: t('Common.noResults'),
      selectedCount: t('Common.selectedCount'),
      ...labels,
    }),
    [labels, t],
  );
}

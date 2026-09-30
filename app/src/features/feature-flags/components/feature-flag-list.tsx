import { List, Table2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeatureFlag } from '@/api-client';
import { GradientButton } from '@/components/gradient-button';
import {
  type FilterFieldDefinition,
  FilterToolbarQuickAccessFilters,
  useFilterBuilder,
} from '@/functionals/filters';
import { FilterTableLayout } from '@/functionals/table';
import { cn } from '@/lib/utils';
import { FeatureFlagCard } from './feature-flag-card';
import { FeatureFlagsTable } from './feature-flag-table';

type FeatureFlagListProps = {
  featureFlags: FeatureFlag[];
  viewMode: FeatureFlagViewMode;
  onViewModeChange: (nextView: FeatureFlagViewMode) => void;
};

type FeatureFlagViewMode = 'table' | 'list';

export function FeatureFlagList({
  featureFlags,
  viewMode,
  onViewModeChange,
}: FeatureFlagListProps) {
  const { t } = useTranslation();

  const typeOptions = useMemo(() => {
    const uniqueTypes = [...new Set(featureFlags.map((flag) => flag.type))];
    return uniqueTypes.sort().map((type) => ({
      label: type,
      value: type,
    }));
  }, [featureFlags]);

  const filterFields = useMemo<FilterFieldDefinition<FeatureFlag>[]>(() => {
    return [
      {
        id: 'name',
        label: t('Pages.FeatureFlags.Table.Columns.name', 'Name'),
        type: 'text',
        accessor: (flag) => flag.name,
        placeholder: t('Pages.FeatureFlags.Table.Columns.name', 'Name'),
      },
      {
        id: 'type',
        label: t('Pages.FeatureFlags.Table.Columns.type', 'Type'),
        type: 'enum',
        accessor: (flag) => flag.type,
        options: typeOptions,
        quickAccess: true,
      },
      {
        id: 'enabled',
        label: t('Pages.FeatureFlags.Table.Columns.enabled', 'Status'),
        type: 'boolean',
        accessor: (flag) => flag.enabled,
        quickAccess: true,
      },
    ];
  }, [t, typeOptions]);

  const filterController = useFilterBuilder({
    data: featureFlags,
    fields: filterFields,
    pinnedFilterIds: ['name'],
    debounceMs: 200,
    resetOnDataChange: true,
  });
  const filteredData = filterController.filteredData;
  const emptyText =
    featureFlags.length > 0
      ? t('Common.noResults')
      : t('Pages.FeatureFlags.Card.empty');

  return (
    <FilterTableLayout controller={filterController}>
      <FilterTableLayout.Toolbar className="shrink-0">
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search
            filterId="name"
            inputClassName="w-full sm:w-[300px]"
          >
            <FilterToolbarQuickAccessFilters className="sm:shrink-0" />
          </FilterTableLayout.Search>
          <FilterTableLayout.Actions className="gap-2">
            <div className="bg-muted inline-flex h-10 items-center rounded-xl border border-border/70 p-1">
              <button
                type="button"
                aria-pressed={viewMode === 'table'}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
                  viewMode === 'table'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => onViewModeChange('table')}
              >
                <Table2 className="size-4" />
                {t('Common.table', 'Table')}
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'list'}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
                  viewMode === 'list'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => onViewModeChange('list')}
              >
                <List className="size-4" />
                {t('Common.list', 'List')}
              </button>
            </div>
            <GradientButton
              to="/feature-flags/new"
              label={t('Pages.FeatureFlags.Mutation.titleNew')}
            />
          </FilterTableLayout.Actions>
        </FilterTableLayout.ToolbarRow>
        <FilterTableLayout.Filters />
      </FilterTableLayout.Toolbar>

      <FilterTableLayout.Content
        className={viewMode === 'table' ? 'mt-4' : 'mt-4 overflow-auto pr-1'}
      >
        {viewMode === 'table' ? (
          <FeatureFlagsTable featureFlags={filteredData} className="h-full" />
        ) : (
          <div className="space-y-4">
            {filteredData.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                {emptyText}
              </div>
            ) : (
              filteredData.map((flag) => (
                <FeatureFlagCard key={flag.id} flag={flag} />
              ))
            )}
          </div>
        )}
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
}

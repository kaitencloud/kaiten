import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type FilterFieldDefinition,
  FilterToolbarQuickAccessFilters,
  useFilterBuilder,
} from '@/functionals/filters';
import { DataTable, FilterTableLayout } from '@/functionals/table';
import { webhookHistoryQueryOptions } from '../../queries';
import { webhooksQueryOptions } from '../../queries/webhooks-query-options';
import type { WebhookHistoryEntry } from '../../types';
import { createWebhookHistoryColumns } from './webhook-history-columns';
import { WebhookHistoryFailureDialog } from './webhook-history-failure-dialog';
import {
  buildWebhookHistoryEventOptions,
  buildWebhookHistoryHookOptions,
  buildWebhookHistoryHookUrlById,
  buildWebhookHistoryStatusOptions,
  createWebhookHistoryFilterFields,
  sortWebhookHistoryEntries,
} from './webhook-history-filters';
import { HistoryEmptyState } from './webhook-history-view';

function useWebhookHistoryController() {
  const { t } = useTranslation();
  const { data: webhookHistoryData } = useSuspenseQuery(
    webhookHistoryQueryOptions,
  );
  const { data: webhooksData } = useSuspenseQuery(webhooksQueryOptions);
  const [selectedFailureEntry, setSelectedFailureEntry] =
    useState<WebhookHistoryEntry | null>(null);
  const sortedHistory = useMemo(
    () => sortWebhookHistoryEntries(webhookHistoryData.history ?? []),
    [webhookHistoryData.history],
  );
  const hookUrlById = useMemo(
    () => buildWebhookHistoryHookUrlById(sortedHistory, webhooksData ?? []),
    [sortedHistory, webhooksData],
  );
  const filterFields = useMemo<FilterFieldDefinition<WebhookHistoryEntry>[]>(
    () =>
      createWebhookHistoryFilterFields({
        eventOptions: buildWebhookHistoryEventOptions(sortedHistory, t),
        hookOptions: buildWebhookHistoryHookOptions(hookUrlById),
        hookUrlById,
        statusOptions: buildWebhookHistoryStatusOptions(t),
        t,
      }),
    [hookUrlById, sortedHistory, t],
  );
  const filterController = useFilterBuilder({
    data: sortedHistory,
    fields: filterFields,
    pinnedFilterIds: ['query'],
    debounceMs: 200,
    resetOnDataChange: true,
  });

  return {
    columns: createWebhookHistoryColumns({
      hookUrlById,
      onSelectFailure: setSelectedFailureEntry,
      t,
    }),
    filteredHistory: filterController.filteredData,
    filterController,
    selectedFailureEntry,
    setSelectedFailureEntry,
    sortedHistory,
    t,
  };
}

function WebhookHistoryTableContent({
  columns,
  filteredHistory,
  sortedHistory,
  t,
}: {
  columns: ReturnType<typeof createWebhookHistoryColumns>;
  filteredHistory: WebhookHistoryEntry[];
  sortedHistory: WebhookHistoryEntry[];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  if (sortedHistory.length === 0) {
    return <HistoryEmptyState />;
  }

  if (filteredHistory.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t('Pages.Integrations.Webhooks.History.Table.emptyState')}
      </div>
    );
  }

  return (
    <DataTable
      className="h-full"
      columns={columns}
      data={filteredHistory}
      bodyScrollable
    />
  );
}

export function WebhookHistorySection() {
  const {
    columns,
    filteredHistory,
    filterController,
    selectedFailureEntry,
    setSelectedFailureEntry,
    sortedHistory,
    t,
  } = useWebhookHistoryController();

  function handleFailureDialogOpenChange(open: boolean) {
    if (!open) {
      setSelectedFailureEntry(null);
    }
  }

  return (
    <>
      <FilterTableLayout controller={filterController} className="pt-0">
        <FilterTableLayout.Toolbar className="shrink-0">
          <FilterTableLayout.ToolbarRow>
            <FilterTableLayout.Search
              filterId="query"
              inputClassName="w-full sm:w-[320px]"
            >
              <FilterToolbarQuickAccessFilters className="sm:shrink-0" />
            </FilterTableLayout.Search>
          </FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Filters />
        </FilterTableLayout.Toolbar>

        <FilterTableLayout.Content>
          <WebhookHistoryTableContent
            columns={columns}
            filteredHistory={filteredHistory}
            sortedHistory={sortedHistory}
            t={t}
          />
        </FilterTableLayout.Content>
      </FilterTableLayout>

      <WebhookHistoryFailureDialog
        entry={selectedFailureEntry}
        onOpenChange={handleFailureDialogOpenChange}
      />
    </>
  );
}

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
import {
  deliveryFromHistoryEntry,
  getHistoryEntryAttemptId,
} from '../../utils/webhook-deliveries';
import { WebhookDeliveryDetailDialog } from '../webhook-deliveries';
import { createWebhookHistoryColumns } from './webhook-history-columns';
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
  // The entry is kept while the dialog closes, so its content stays drawn
  // during the closing animation; `detailOpen` alone opens and closes it.
  const [selectedEntry, setSelectedEntry] =
    useState<WebhookHistoryEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
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
    // The history is one list that grows: a refetch (after a resend, or on
    // window focus) must not wipe the search the reader typed.
    resetOnDataChange: false,
  });

  function selectEntry(entry: WebhookHistoryEntry) {
    setSelectedEntry(entry);
    setDetailOpen(true);
  }

  return {
    columns: createWebhookHistoryColumns({
      hookUrlById,
      onSelectEntry: selectEntry,
      t,
    }),
    detailOpen,
    filteredHistory: filterController.filteredData,
    filterController,
    selectedEntry,
    setDetailOpen,
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
    detailOpen,
    filteredHistory,
    filterController,
    selectedEntry,
    setDetailOpen,
    sortedHistory,
    t,
  } = useWebhookHistoryController();
  // The detail opens on the clicked attempt alone: a refetch that drops it
  // from the history's window cannot close the dialog under the reader.
  const selectedDelivery = useMemo(
    () => (selectedEntry ? deliveryFromHistoryEntry(selectedEntry) : null),
    [selectedEntry],
  );

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

      <WebhookDeliveryDetailDialog
        delivery={selectedDelivery}
        initialAttemptId={
          selectedEntry ? getHistoryEntryAttemptId(selectedEntry) : undefined
        }
        onOpenChange={setDetailOpen}
        open={detailOpen}
      />
    </>
  );
}

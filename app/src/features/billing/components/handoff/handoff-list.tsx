import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QueuedInvoice } from '@/api-client';
import { useCanPerform } from '@/domains/billing';
import {
  type FilterFieldDefinition,
  useFilterBuilder,
} from '@/functionals/filters';
import { FilterTableLayout } from '@/functionals/table';
import type { HandoffQueueStatus } from '../../schemas/handoff-search.schema';
import {
  createHandoffFilterFields,
  INVOICE_FILTER_IDS,
} from '../../utils/invoice-filter-fields';
import { AcknowledgeHandoffDialog } from './acknowledge-handoff-dialog';
import { HandoffEmpty } from './handoff-empty';
import { HandoffQueueTabs } from './handoff-queue-tabs';
import { HandoffTable } from './handoff-table';
import { InvoicesViewSwitcher } from './invoices-view-switcher';

type HandoffListProps = {
  /** Every invoice of the part of the queue, read whole. */
  invoices: readonly QueuedInvoice[];
  status: HandoffQueueStatus;
};

/**
 * The invoices of the queue in one status as a list like the others: a search that
 * matches who an invoice is for, the invoice itself and the number the accounting
 * system booked it under, the parts of the queue beside it, the Filter menu with its
 * chips, the switch back to every invoice at the end of the toolbar, and a table sorted
 * and paged in the browser, oldest issue first as the queue is read. A person who
 * may acknowledge gets the button on what waits, and the dialog it opens; once the
 * API has accepted it, the queue is read again and the invoice moves to the other
 * status.
 */
export function HandoffList({ invoices, status }: HandoffListProps) {
  const { t } = useTranslation();
  const canAcknowledge = useCanPerform('handoff.acknowledge');
  const [target, setTarget] = useState<QueuedInvoice | null>(null);
  const fields = useMemo<FilterFieldDefinition<QueuedInvoice>[]>(
    () => createHandoffFilterFields(t),
    [t],
  );
  const controller = useFilterBuilder({
    data: invoices as QueuedInvoice[],
    debounceMs: 200,
    fields,
    pinnedFilterIds: [INVOICE_FILTER_IDS.search],
    // The filters are values: acknowledging an invoice reads the queue again, and
    // must not wipe what the person typed or picked to find the next one.
    resetOnDataChange: false,
  });

  return (
    <>
      <FilterTableLayout controller={controller}>
        <FilterTableLayout.Toolbar>
          <FilterTableLayout.ToolbarRow>
            {/* The parts of the queue wrap under the search when the row is narrow,
                instead of pushing the Filter button and the views past the page. */}
            <FilterTableLayout.Search
              className="sm:flex-wrap"
              filterId={INVOICE_FILTER_IDS.search}
            >
              <HandoffQueueTabs />
            </FilterTableLayout.Search>
            <FilterTableLayout.Actions>
              <InvoicesViewSwitcher />
            </FilterTableLayout.Actions>
          </FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Filters />
        </FilterTableLayout.Toolbar>

        <FilterTableLayout.Content>
          <HandoffTable
            bodyScrollable
            className="h-full"
            emptyMessage={
              <HandoffEmpty
                filtered={controller.hasActiveFilters}
                onClearFilters={controller.resetAll}
                status={status}
              />
            }
            invoices={controller.filteredData}
            onAcknowledge={canAcknowledge ? setTarget : undefined}
            status={status}
          />
        </FilterTableLayout.Content>
      </FilterTableLayout>
      {target ? (
        <AcknowledgeHandoffDialog
          invoice={target}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </>
  );
}

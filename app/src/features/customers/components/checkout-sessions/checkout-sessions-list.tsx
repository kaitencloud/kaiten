import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CheckoutSessionAdmin } from '@/api-client';
import { Button } from '@/components/ui/button';
import { ListEmptyState, TableEmptyMessage } from '@/domains/billing';
import {
  type FilterFieldDefinition,
  useFilterBuilder,
} from '@/functionals/filters';
import { FilterTableLayout } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { useSeededFilter } from '../../hooks/use-seeded-filter';
import {
  createCheckoutSessionFilterFields,
  CHECKOUT_SESSION_FILTER_IDS,
} from '../../utils/checkout-session-filter-fields';
import type { CheckoutLabels } from '../../utils/checkout-session';
import { CheckoutSessionsTable } from './checkout-sessions-table';

type CheckoutSessionsListProps = {
  /** The filters the list opens with, by filter id: where a link to it starts them. */
  initialFilterValues?: Record<string, string>;
  /** The names a checkout shows in place of ids and slugs. */
  labels: CheckoutLabels;
  onOpen: (session: CheckoutSessionAdmin) => void;
  /** The person took the status away from what the address asked for: the address forgets it. */
  onStatusSeedDropped: () => void;
  /** Every checkout of the organization, read whole. */
  sessions: readonly CheckoutSessionAdmin[];
};

/**
 * The anonymous checkouts of the organization as a list like the others: a search that
 * matches who started a checkout and what it created, the Filter menu with its chips, and
 * the table, sorted and paged in the browser. The console holds every checkout, so it
 * filters them itself and never asks the API to. The list only reads: no checkout is
 * started, confirmed or changed from the console.
 */
export function CheckoutSessionsList({
  initialFilterValues,
  labels,
  onOpen,
  onStatusSeedDropped,
  sessions,
}: CheckoutSessionsListProps) {
  const { t } = useTranslation();
  const fields = useMemo<FilterFieldDefinition<CheckoutSessionAdmin>[]>(
    () => createCheckoutSessionFilterFields({ labels, t }),
    [labels, t],
  );
  const controller = useFilterBuilder({
    data: sessions as CheckoutSessionAdmin[],
    debounceMs: 200,
    fields,
    initialNormalValues: initialFilterValues,
    pinnedFilterIds: [CHECKOUT_SESSION_FILTER_IDS.search],
    // The filters are values, valid for any set of checkouts: a refetch must not wipe
    // what was typed or picked.
    resetOnDataChange: false,
  });
  useSeededFilter({
    controls: controller.normal,
    filterId: CHECKOUT_SESSION_FILTER_IDS.status,
    onSeedDropped: onStatusSeedDropped,
    seed: initialFilterValues?.[CHECKOUT_SESSION_FILTER_IDS.status],
  });
  const CheckoutIcon = dataModelIcons.checkoutSession;
  const prefix = 'Pages.Customers.CheckoutSessions.Empty';

  return (
    <FilterTableLayout controller={controller}>
      <FilterTableLayout.Toolbar>
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search
            filterId={CHECKOUT_SESSION_FILTER_IDS.search}
          />
        </FilterTableLayout.ToolbarRow>
        <FilterTableLayout.Filters />
      </FilterTableLayout.Toolbar>
      <FilterTableLayout.Content>
        {sessions.length === 0 ? (
          // Not drawn in the table: its width is that of its columns, wider than the page,
          // and the message would be cut off by the edge of the screen.
          <ListEmptyState
            description={t(`${prefix}.description`)}
            icon={CheckoutIcon}
            testId="checkout-sessions-empty"
            title={t(`${prefix}.title`)}
          />
        ) : (
          <CheckoutSessionsTable
            emptyMessage={
              <TableEmptyMessage
                description={t(`${prefix}.filteredDescription`)}
                testId="checkout-sessions-filtered-empty"
                title={t(`${prefix}.filteredTitle`)}
              >
                <Button
                  onClick={controller.resetAll}
                  size="sm"
                  variant="outline"
                >
                  {t('Pages.Customers.CheckoutSessions.Filters.clear')}
                </Button>
              </TableEmptyMessage>
            }
            labels={labels}
            onOpen={onOpen}
            sessions={controller.filteredData}
          />
        )}
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
}

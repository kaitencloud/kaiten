import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import { GradientButton } from '@/components/gradient-button';
import { ListEmptyState, useCanPerform } from '@/domains/billing';
import {
  type FilterFieldDefinition,
  useFilterBuilder,
} from '@/functionals/filters';
import { FilterTableLayout } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { useVoucherCustomerNames } from '../../hooks/use-voucher-customers';
import {
  createVoucherFilterFields,
  VOUCHER_FILTER_IDS,
} from '../../utils/voucher-filter-fields';
import { VoucherLookup } from './voucher-lookup';
import { VouchersEmpty } from './vouchers-empty';
import { VouchersTable } from './vouchers-table';

type VoucherListProps = {
  /** Every voucher of the organization, read whole. */
  vouchers: readonly Voucher[];
};

/**
 * The vouchers of the organization as a list page like the others: a search that
 * matches the name, the code and the customer, the Filter menu for the status and the
 * kind, a way to open a voucher by the code a customer sends, and the table, sorted and
 * paged in the browser. The console holds every voucher, so it filters them itself, and
 * what is typed in the search, a code among it, stays in the memory of the page.
 */
export function VoucherList({ vouchers }: VoucherListProps) {
  const { t } = useTranslation();
  const mayCreate = useCanPerform('vouchers.create');
  const customerNames = useVoucherCustomerNames();
  const fields = useMemo<FilterFieldDefinition<Voucher>[]>(
    () => createVoucherFilterFields({ customerNames, t }),
    [customerNames, t],
  );
  const controller = useFilterBuilder({
    data: vouchers as Voucher[],
    debounceMs: 200,
    fields,
    pinnedFilterIds: [VOUCHER_FILTER_IDS.search],
    // The filters are values, valid for any set of vouchers: a refetch after an action
    // must not wipe what the search found it with.
    resetOnDataChange: false,
  });
  const VoucherIcon = dataModelIcons.voucher;

  if (vouchers.length === 0) {
    return (
      <div className="pt-6">
        <ListEmptyState
          description={t('Pages.Vouchers.List.Empty.description')}
          icon={VoucherIcon}
          testId="vouchers-empty"
          title={t('Pages.Vouchers.List.Empty.title')}
        >
          {mayCreate ? (
            <GradientButton
              label={t('Pages.Vouchers.List.new')}
              to="/vouchers/new"
            />
          ) : null}
        </ListEmptyState>
      </div>
    );
  }

  return (
    <FilterTableLayout controller={controller}>
      <FilterTableLayout.Toolbar>
        <FilterTableLayout.ToolbarRow>
          <FilterTableLayout.Search filterId={VOUCHER_FILTER_IDS.search} />
          <FilterTableLayout.Actions className="flex-wrap gap-3">
            <VoucherLookup />
            {mayCreate ? (
              <GradientButton
                label={t('Pages.Vouchers.List.new')}
                to="/vouchers/new"
              />
            ) : null}
          </FilterTableLayout.Actions>
        </FilterTableLayout.ToolbarRow>
        <FilterTableLayout.Filters />
      </FilterTableLayout.Toolbar>
      <FilterTableLayout.Content>
        <VouchersTable
          customerNames={customerNames}
          emptyMessage={<VouchersEmpty onClearFilters={controller.resetAll} />}
          vouchers={controller.filteredData}
        />
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
}

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { InvoiceSummary } from '@/api-client';
import {
  ExportInvoicesMenu,
  type InvoicesTableColumn,
  InvoicesTable,
} from '@/domains/billing';
import {
  type FilterFieldDefinition,
  useFilterBuilder,
} from '@/functionals/filters';
import { FilterTableLayout } from '@/functionals/table';
import type { InvoiceScope } from '../../schemas/invoice-scope.schema';
import {
  getAppliedFilters,
  toInvoiceExportSelection,
} from '../../utils/invoice-export-filters';
import {
  createInvoicesFilterFields,
  INVOICE_FILTER_IDS,
} from '../../utils/invoice-filter-fields';
import { InvoiceScopeChips } from './invoice-scope-chips';
import { InvoicesEmpty } from './invoices-empty';

type InvoicesListProps = {
  /** Whether the session may export: where it may not, the menu is not there. */
  canExport: boolean;
  /** The filters the list opens with, by filter id: where a link to it starts them. */
  initialFilterValues?: Record<string, string>;
  /** Every invoice of the scope, read whole. */
  invoices: InvoiceSummary[];
  /** Writes the scope to the URL, which the page follows. */
  onScopeChange: (scope: InvoiceScope) => void;
  /** The customer or the instance the URL scopes the list to. */
  scope: InvoiceScope;
  /** Whether Stripe collects invoices here: with NoOp alone the provider is not worth a column or a filter. */
  showProvider: boolean;
};

// The same array on every render: the table builds its columns from it.
const WITHOUT_PROVIDER: readonly InvoicesTableColumn[] = ['provider'];
const WITH_PROVIDER: readonly InvoicesTableColumn[] = [];

/**
 * The invoices of the organization as a list page like the others: a search that
 * matches who an invoice is for and the invoice itself, the Filter menu with its
 * chips, the export where the page actions go, and the table, sorted and paged in
 * the browser. The console holds every invoice of the scope, so it filters them
 * itself; the scope, a customer or an instance, is the API's and stays a chip in the
 * toolbar and a search of the URL. The export is the API's too, and takes the scope
 * and every filter of the screen that it has too; it says which it leaves out.
 */
export function InvoicesList({
  canExport,
  initialFilterValues,
  invoices,
  onScopeChange,
  scope,
  showProvider,
}: InvoicesListProps) {
  const { t } = useTranslation();
  const fields = useMemo<FilterFieldDefinition<InvoiceSummary>[]>(
    () => createInvoicesFilterFields({ showProvider, t }),
    [showProvider, t],
  );
  const controller = useFilterBuilder({
    data: invoices,
    debounceMs: 200,
    fields,
    initialNormalValues: initialFilterValues,
    pinnedFilterIds: [INVOICE_FILTER_IDS.search],
    // The filters are values, valid for any set of invoices: taking the scope off
    // must not wipe what was typed or picked.
    resetOnDataChange: false,
  });
  const { filters, unapplied } = toInvoiceExportSelection(
    scope,
    getAppliedFilters(controller.normal),
  );
  const unappliedLabels = unapplied.map(
    (id) => fields.find((field) => field.id === id)?.label ?? id,
  );

  return (
    <FilterTableLayout controller={controller}>
      <FilterTableLayout.Toolbar>
        <FilterTableLayout.ToolbarRow>
          {/* The chips of the scope wrap under the search when the row is narrow,
              instead of pushing the Filter button and the export past the page. */}
          <FilterTableLayout.Search
            className="sm:flex-wrap"
            filterId={INVOICE_FILTER_IDS.search}
          >
            <InvoiceScopeChips onChange={onScopeChange} scope={scope} />
          </FilterTableLayout.Search>
          {canExport ? (
            <FilterTableLayout.Actions>
              <ExportInvoicesMenu
                filters={filters}
                unapplied={unappliedLabels}
              />
            </FilterTableLayout.Actions>
          ) : null}
        </FilterTableLayout.ToolbarRow>
        <FilterTableLayout.Filters />
      </FilterTableLayout.Toolbar>

      <FilterTableLayout.Content>
        <InvoicesTable
          bodyScrollable
          className="h-full"
          emptyMessage={
            <InvoicesEmpty
              filtered={controller.hasActiveFilters}
              onClearFilters={controller.resetAll}
              onClearScope={() => onScopeChange({})}
              scope={scope}
            />
          }
          hiddenColumns={showProvider ? WITH_PROVIDER : WITHOUT_PROVIDER}
          invoices={controller.filteredData}
        />
      </FilterTableLayout.Content>
    </FilterTableLayout>
  );
}

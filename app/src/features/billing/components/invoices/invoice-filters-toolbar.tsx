import { Filter, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { InvoiceFilters } from '../../schemas/invoice-filters.schema';
import {
  getInvoiceFilterChips,
  type InvoiceFilterChip,
} from '../../utils/invoice-filter-chips';
import { countActiveInvoiceFilters } from '../../utils/invoice-filters';
import { InvoiceFiltersFields } from './invoice-filters-fields';

type InvoiceFiltersToolbarProps = {
  filters: InvoiceFilters;
  onChange: (filters: InvoiceFilters) => void;
  /** Whether Stripe collects invoices here: with NoOp alone there is no provider to choose. */
  showProvider: boolean;
};

/**
 * The filters of the list, which the URL holds: a button that opens all of them,
 * a chip for each one that is set, and a way to take them all off. The filters
 * are the API's, applied by the server, since the list is paged and a filter run
 * on the page that was loaded would miss the rest.
 */
export function InvoiceFiltersToolbar({
  filters,
  onChange,
  showProvider,
}: InvoiceFiltersToolbarProps) {
  const { i18n, t } = useTranslation();
  const count = countActiveInvoiceFilters(filters);
  const chips = getInvoiceFilterChips(filters, t, i18n.language);

  function renderChip(chip: InvoiceFilterChip) {
    return (
      <Badge
        className="gap-1 py-1 pr-1 pl-2.5 font-normal"
        data-filter={chip.id}
        key={chip.id}
        variant="secondary"
      >
        {chip.label}
        <button
          aria-label={t('Pages.Billing.Invoices.Filters.remove', {
            filter: chip.label,
          })}
          className="inline-flex size-5 items-center justify-center rounded-full hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => onChange({ ...filters, ...chip.clear })}
          type="button"
        >
          <X aria-hidden className="size-3" />
        </button>
      </Badge>
    );
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger
          render={
            <Button
              className="h-9 gap-2"
              size="sm"
              type="button"
              variant={count > 0 ? 'secondary' : 'outline'}
            >
              <Filter className="size-4" />
              {t('Pages.Billing.Invoices.Filters.button')}
              {count > 0 ? (
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-background text-xs font-medium text-foreground">
                  {count}
                </span>
              ) : null}
            </Button>
          }
        />
        <PopoverContent
          align="start"
          aria-label={t('Pages.Billing.Invoices.Filters.panelLabel')}
          className="max-h-[70vh] w-[min(92vw,30rem)] overflow-y-auto"
        >
          <InvoiceFiltersFields
            filters={filters}
            onChange={onChange}
            showProvider={showProvider}
          />
        </PopoverContent>
      </Popover>
      {chips.map(renderChip)}
      {count > 0 ? (
        <Button
          onClick={() => onChange({})}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t('Pages.Billing.Invoices.Filters.clear')}
        </Button>
      ) : null}
    </div>
  );
}

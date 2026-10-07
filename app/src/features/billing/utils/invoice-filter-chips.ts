import type { TFunction } from 'i18next';
import {
  getHandoffStatusLabelKey,
  getInvoiceKindLabelKey,
  getInvoiceStatusLabelKey,
  getProviderKindLabelKey,
  formatUtcDate,
} from '@/domains/billing';
import type { InvoiceFilters } from '../schemas/invoice-filters.schema';

/** A filter that is set, as the chip that names it and takes it off. */
export type InvoiceFilterChip = {
  /** The filters the chip removes, which are all of them but the others'. */
  clear: Partial<InvoiceFilters>;
  id: string;
  label: string;
};

const NOTHING = undefined;

function periodLabel(
  from: string | undefined,
  to: string | undefined,
  language: string,
  t: TFunction,
): string {
  const open = t('Pages.Billing.Invoices.Filters.openEnd');

  return `${from ? formatUtcDate(from, language) : open} → ${to ? formatUtcDate(to, language) : open}`;
}

/**
 * The chips of the filters that are set, in the order the filters are listed. A
 * chip says the filter in words, so that a list that is short because of a filter
 * never reads as a list that has little, and each takes its filter off.
 */
export function getInvoiceFilterChips(
  filters: InvoiceFilters,
  t: TFunction,
  language: string,
): InvoiceFilterChip[] {
  const chips: InvoiceFilterChip[] = [];
  const add = (
    id: string,
    label: string,
    clear: Partial<InvoiceFilters>,
  ): void => {
    chips.push({ clear, id, label });
  };
  const named = (field: string, value: string) =>
    t('Pages.Billing.Invoices.Filters.chip', { field, value });

  if (filters.status?.length) {
    add(
      'status',
      named(
        t('Pages.Billing.Invoices.Filters.status'),
        filters.status
          .map((status) => t(getInvoiceStatusLabelKey(status)))
          .join(', '),
      ),
      { status: NOTHING },
    );
  }
  if (filters.kind) {
    add(
      'kind',
      named(
        t('Pages.Billing.Invoices.Filters.kind'),
        t(getInvoiceKindLabelKey(filters.kind)),
      ),
      { kind: NOTHING },
    );
  }
  if (filters.providerKind) {
    add(
      'providerKind',
      named(
        t('Pages.Billing.Invoices.Filters.provider'),
        t(getProviderKindLabelKey(filters.providerKind)),
      ),
      { providerKind: NOTHING },
    );
  }
  if (filters.handoffStatus) {
    add(
      'handoffStatus',
      named(
        t('Pages.Billing.Invoices.Filters.handoff'),
        t(getHandoffStatusLabelKey(filters.handoffStatus)),
      ),
      { handoffStatus: NOTHING },
    );
  }
  if (filters.overdue) {
    add('overdue', t('Pages.Billing.Invoices.Filters.overdue'), {
      overdue: NOTHING,
    });
  }
  if (filters.held) {
    add('held', t('Pages.Billing.Invoices.Filters.held'), { held: NOTHING });
  }
  if (filters.customerSlug) {
    add(
      'customerSlug',
      named(t('Pages.Billing.Invoices.Filters.customer'), filters.customerSlug),
      { customerSlug: NOTHING },
    );
  }
  if (filters.instanceSlug) {
    add(
      'instanceSlug',
      named(t('Pages.Billing.Invoices.Filters.instance'), filters.instanceSlug),
      { instanceSlug: NOTHING },
    );
  }
  if (filters.boundaryFrom || filters.boundaryTo) {
    add(
      'boundary',
      named(
        t('Pages.Billing.Invoices.Filters.boundary'),
        periodLabel(filters.boundaryFrom, filters.boundaryTo, language, t),
      ),
      { boundaryFrom: NOTHING, boundaryTo: NOTHING },
    );
  }
  if (filters.issuedFrom || filters.issuedTo) {
    add(
      'issued',
      named(
        t('Pages.Billing.Invoices.Filters.issued'),
        periodLabel(filters.issuedFrom, filters.issuedTo, language, t),
      ),
      { issuedFrom: NOTHING, issuedTo: NOTHING },
    );
  }

  return chips;
}

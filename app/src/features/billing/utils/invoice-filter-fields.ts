import type { TFunction } from 'i18next';
import type { InvoiceHandoff, InvoiceSummary } from '@/api-client';
import {
  getHandoffStatusLabelKey,
  getInvoiceKindLabelKey,
  getInvoiceStatusLabelKey,
  getProviderKindLabelKey,
  HANDOFF_STATUSES,
  INVOICE_KINDS,
  INVOICE_PROVIDER_KINDS,
  INVOICE_STATUSES,
  isInvoiceOverdue,
} from '@/domains/billing';
import type {
  FilterFieldDefinition,
  FilterOption,
} from '@/functionals/filters';
import { instantToDateInput } from '@/lib/date-input';

/**
 * The invoice a filter reads: a row of the list of invoices, or of the handoff
 * queue, which also holds the number the accounting system booked it under.
 */
export type FilterableInvoice = InvoiceSummary & {
  handoff?: Pick<InvoiceHandoff, 'externalReference'>;
};

/** The ids of the filters of the lists of invoices: the search is pinned, the others are picked from the Filter menu. */
export const INVOICE_FILTER_IDS = {
  handoff: 'handoff',
  held: 'held',
  issued: 'issued',
  kind: 'kind',
  overdue: 'overdue',
  provider: 'provider',
  search: 'query',
  servicePeriod: 'servicePeriod',
  status: 'status',
} as const;

/**
 * What the search of a list of invoices matches: who the invoice is for (the
 * customer and the instance, by name and by slug), the invoice itself by its
 * identifier and, in the handoff queue, the number the accounting system booked it
 * under. A part of any of them is enough, in any case.
 */
export function getInvoiceSearchTokens(invoice: FilterableInvoice): string[] {
  return [
    invoice.customerName,
    invoice.customerSlug,
    invoice.instanceName,
    invoice.instanceSlug,
    invoice.id,
    invoice.handoff?.externalReference ?? '',
  ];
}

function optionsOf<T extends string>(
  values: readonly T[],
  getLabelKey: (value: T) => string,
  t: TFunction,
): FilterOption[] {
  return values.map((value) => ({ label: t(getLabelKey(value)), value }));
}

type InvoiceFilterField = FilterFieldDefinition<FilterableInvoice>;

const searchField = (t: TFunction): InvoiceFilterField => ({
  accessor: getInvoiceSearchTokens,
  id: INVOICE_FILTER_IDS.search,
  label: t('Pages.Billing.Invoices.Filters.search'),
  placeholder: t('Pages.Billing.Invoices.Filters.searchPlaceholder'),
  type: 'text',
});

const statusField = (t: TFunction): InvoiceFilterField => ({
  accessor: (invoice) => invoice.status,
  id: INVOICE_FILTER_IDS.status,
  label: t('Pages.Billing.Invoices.Filters.status'),
  options: optionsOf(INVOICE_STATUSES, getInvoiceStatusLabelKey, t),
  type: 'enum_list',
});

const kindField = (t: TFunction): InvoiceFilterField => ({
  accessor: (invoice) => invoice.kind,
  id: INVOICE_FILTER_IDS.kind,
  label: t('Pages.Billing.Invoices.Filters.kind'),
  options: optionsOf(INVOICE_KINDS, getInvoiceKindLabelKey, t),
  type: 'enum',
});

const handoffField = (t: TFunction): InvoiceFilterField => ({
  accessor: (invoice) => invoice.handoffStatus,
  id: INVOICE_FILTER_IDS.handoff,
  label: t('Pages.Billing.Invoices.Filters.handoff'),
  options: optionsOf(HANDOFF_STATUSES, getHandoffStatusLabelKey, t),
  type: 'enum',
});

const providerField = (t: TFunction): InvoiceFilterField => ({
  accessor: (invoice) => invoice.providerKind,
  id: INVOICE_FILTER_IDS.provider,
  label: t('Pages.Billing.Invoices.Filters.provider'),
  options: optionsOf(INVOICE_PROVIDER_KINDS, getProviderKindLabelKey, t),
  type: 'enum',
});

// The same words the status badge of the table says: an unpaid invoice past its
// due date, which the API does not say and the console derives.
const overdueField = (t: TFunction): InvoiceFilterField => ({
  accessor: (invoice) => isInvoiceOverdue(invoice),
  id: INVOICE_FILTER_IDS.overdue,
  label: t('Pages.Billing.Invoices.Filters.overdue'),
  type: 'boolean',
});

/** Whether an invoice is on hold: the filter, the Held view and its count all ask this. */
export const isInvoiceHeld = (invoice: InvoiceSummary): boolean =>
  Boolean(invoice.holdReason);

const heldField = (t: TFunction): InvoiceFilterField => ({
  accessor: isInvoiceHeld,
  id: INVOICE_FILTER_IDS.held,
  label: t('Pages.Billing.Invoices.Filters.held'),
  type: 'boolean',
});

// A date filter says a day, and a day is a UTC day here as everywhere in billing:
// the field holds the day an instant falls on, as a date input writes it.
const issuedField = (t: TFunction): InvoiceFilterField => ({
  accessor: (invoice) => instantToDateInput(invoice.issuedAt),
  id: INVOICE_FILTER_IDS.issued,
  label: t('Pages.Billing.Invoices.Filters.issued'),
  type: 'date',
});

const servicePeriodField = (t: TFunction): InvoiceFilterField => ({
  accessor: (invoice) => instantToDateInput(invoice.serviceFrom),
  id: INVOICE_FILTER_IDS.servicePeriod,
  label: t('Pages.Billing.Invoices.Filters.servicePeriod'),
  type: 'date',
});

type InvoicesFilterFieldsOptions = {
  /** Whether Stripe collects invoices here: with NoOp alone who collects an invoice is never a question. */
  showProvider: boolean;
  t: TFunction;
};

/**
 * The fields of the list of invoices: the search, pinned, then what the Filter
 * menu offers. They filter the rows the console holds, which is all of them.
 */
export function createInvoicesFilterFields({
  showProvider,
  t,
}: InvoicesFilterFieldsOptions): InvoiceFilterField[] {
  return [
    searchField(t),
    statusField(t),
    kindField(t),
    handoffField(t),
    ...(showProvider ? [providerField(t)] : []),
    overdueField(t),
    heldField(t),
    issuedField(t),
    servicePeriodField(t),
  ];
}

/**
 * The fields of the handoff queue: the search, then what tells one waiting
 * invoice from another. What every invoice of the queue has in common (it waits for
 * the accounting system, nobody collects it) is not a filter.
 */
export function createHandoffFilterFields(t: TFunction): InvoiceFilterField[] {
  return [searchField(t), statusField(t), kindField(t), overdueField(t)];
}

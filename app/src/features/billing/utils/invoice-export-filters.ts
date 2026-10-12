import {
  HANDOFF_STATUSES,
  INVOICE_KINDS,
  INVOICE_PROVIDER_KINDS,
  INVOICE_STATUSES,
  type InvoiceExportFilters,
  type InvoicesScope,
} from '@/domains/billing';
import {
  FILTER_MULTI_SELECT_SEPARATOR,
  type UseFilterBuilderResult,
} from '@/functionals/filters';
import { dateInputToInstant } from '@/lib/date-input';
import { INVOICE_FILTER_IDS } from './invoice-filter-fields';

/** A filter of the screen that has a value: its field, and what it was set to. */
type AppliedFilter = { id: string; value: string };

/** What the export of a list is asked for. */
type InvoiceExportSelection = {
  /** The scope of the page and every filter the API takes the same way. */
  filters: InvoiceExportFilters;
  /** The ids of the filters the screen applies and the file cannot: the file would hold what the screen does not show. */
  unapplied: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The filters of the screen that hold a value: the pinned and the quick-access ones, and the ones picked from the menu. */
export function getAppliedFilters(
  normal: Pick<
    UseFilterBuilderResult<unknown>['normal'],
    'activeFilterIds' | 'pinnedFilterIds' | 'quickAccessFilterIds' | 'values'
  >,
): AppliedFilter[] {
  return [
    ...normal.pinnedFilterIds,
    ...normal.quickAccessFilterIds,
    ...normal.activeFilterIds,
  ].flatMap((id) => {
    const value = normal.values[id]?.trim() ?? '';

    return value ? [{ id, value }] : [];
  });
}

// The values a filter holds are the options' own, in their own case: a filter
// that was typed or linked may not be.
function known<T extends string>(
  values: readonly T[],
  value: string,
): T | undefined {
  return values.find(
    (candidate) => candidate.toLowerCase() === value.trim().toLowerCase(),
  );
}

function knownAll<T extends string>(
  values: readonly T[],
  selection: string,
): T[] {
  return selection.split(FILTER_MULTI_SELECT_SEPARATOR).flatMap((picked) => {
    const value = known(values, picked);

    return value ? [value] : [];
  });
}

/**
 * Puts a filter of the screen in the query of the export when the API has the same
 * filter, and says whether it did. A boolean filter maps only when it asks for
 * "yes": the API takes `held` as "only these", and a screen that hides them has no
 * equivalent. A day maps to the period that starts at its first instant and ends
 * where the next day starts, which holds exactly the invoices of that UTC day.
 *
 * `overdue` is not sent, although the API has a filter of that name: it counts an
 * invoice overdue past its due date whatever collects it and whether its payment
 * failed, and the screen only one that `SEND_INVOICE` collects (`isInvoiceOverdue`).
 * The file would hold invoices the screen does not show, so the filter is named as
 * one the file leaves out.
 */
function put(
  filters: InvoiceExportFilters,
  { id, value }: AppliedFilter,
): boolean {
  switch (id) {
    case INVOICE_FILTER_IDS.status: {
      const status = knownAll(INVOICE_STATUSES, value);
      if (status.length === 0) {
        return false;
      }
      filters.status = status;

      return true;
    }
    case INVOICE_FILTER_IDS.kind: {
      const kind = known(INVOICE_KINDS, value);
      if (!kind) {
        return false;
      }
      filters.kind = kind;

      return true;
    }
    case INVOICE_FILTER_IDS.handoff: {
      const handoffStatus = known(HANDOFF_STATUSES, value);
      if (!handoffStatus) {
        return false;
      }
      filters.handoffStatus = handoffStatus;

      return true;
    }
    case INVOICE_FILTER_IDS.provider: {
      const providerKind = known(INVOICE_PROVIDER_KINDS, value);
      if (!providerKind) {
        return false;
      }
      filters.providerKind = providerKind;

      return true;
    }
    case INVOICE_FILTER_IDS.held: {
      if (value.trim().toLowerCase() !== 'true') {
        return false;
      }
      filters.held = true;

      return true;
    }
    case INVOICE_FILTER_IDS.issued: {
      const from = dateInputToInstant(value);
      if (!from) {
        return false;
      }
      filters.issuedFrom = from;
      filters.issuedTo = new Date(Date.parse(from) + DAY_MS).toISOString();

      return true;
    }
    default:
      return false;
  }
}

/**
 * What the export of the list is asked for: the scope of the URL and every filter of
 * the screen that the API takes the same way, so that the file holds what the screen
 * shows. What the API has no filter for (the search, the start of a service period,
 * overdue, a filter that excludes) is named in `unapplied`, for the menu to say so: a
 * file that differs from the screen is never handed over silently.
 */
export function toInvoiceExportSelection(
  scope: InvoicesScope,
  applied: readonly AppliedFilter[],
): InvoiceExportSelection {
  const filters: InvoiceExportFilters = {};
  if (scope.customerSlug) {
    filters.customerSlug = scope.customerSlug;
  }
  if (scope.instanceSlug) {
    filters.instanceSlug = scope.instanceSlug;
  }

  const unapplied = applied.flatMap((filter) =>
    put(filters, filter) ? [] : [filter.id],
  );

  return { filters, unapplied };
}

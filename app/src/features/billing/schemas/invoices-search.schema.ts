import { z } from 'zod';
import {
  type HandoffSearch,
  handoffStatusOf,
  readHandoffSearch,
} from './handoff-search.schema';
import {
  type InvoiceListSeed,
  readInvoiceListSeed,
} from './invoice-list-seed.schema';
import { type InvoiceScope, readInvoiceScope } from './invoice-scope.schema';

/**
 * The views of the list of invoices: every invoice of the organization, or the
 * queue its accounting system reads. They are two reads of two operations, so the
 * view is in the URL, and each view reads its own part of the search.
 */
export type InvoicesView = 'all' | 'handoff';

/** The view the list opens on, and what the bare path shows. */
export const DEFAULT_INVOICES_VIEW: InvoicesView = 'all';

// Only the queue is spelled out: `?view=all` is the bare path, and reads as it.
const invoicesViewSchema = z.object({
  view: z.literal('handoff').optional().catch(undefined),
});

/**
 * What the URL of the list of invoices holds. The `all` view reads the scope the
 * API applies and the filters a link starts the list on; the `handoff` view reads
 * the part of the queue it shows. Each leaves out what belongs to the other, so
 * that a link of one view does not carry the search of the other.
 */
export type InvoicesSearch = HandoffSearch &
  InvoiceListSeed &
  InvoiceScope & { view?: 'handoff' };

export function readInvoicesSearch(
  search: Record<string, unknown>,
): InvoicesSearch {
  const { view } = invoicesViewSchema.parse(search);

  return view === 'handoff'
    ? { ...readHandoffSearch(search), view }
    : { ...readInvoiceScope(search), ...readInvoiceListSeed(search) };
}

/** The view a search asks for: none reads as every invoice. */
export const invoicesViewOf = (search: InvoicesSearch): InvoicesView =>
  search.view ?? DEFAULT_INVOICES_VIEW;

/**
 * What the route's loader depends on, and so what it loads: the part of the queue
 * in the handoff view, the scope the API applies in the other. Everything else in
 * the URL is the page's, in the browser, and does not reload anything.
 */
export function readInvoicesLoaderDeps(search: Record<string, unknown>) {
  const read = readInvoicesSearch(search);

  return invoicesViewOf(read) === 'handoff'
    ? ({ queue: handoffStatusOf(read), view: 'handoff' } as const)
    : ({ scope: readInvoiceScope(read), view: 'all' } as const);
}

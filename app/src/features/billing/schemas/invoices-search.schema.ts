import { z } from 'zod';
import type { HandoffQueueStatus } from './handoff-queue-status';
import {
  type InvoiceListSeed,
  readInvoiceListSeed,
} from './invoice-list-seed.schema';
import { type InvoiceScope, readInvoiceScope } from './invoice-scope.schema';

/**
 * The views of the list of invoices, the row of status tabs above its toolbar: every
 * invoice, those past their due date, those on hold, and the two parts of the queue
 * the accounting system reads, what waits for it and what it acknowledged. The first
 * three read the list of invoices and narrow it in the browser; the last two read the
 * queue, another operation, so the view is in the URL (`?view=`) and each view reads
 * its own part of the search.
 */
export const INVOICES_VIEWS = [
  'all',
  'overdue',
  'held',
  'waiting',
  'acknowledged',
] as const;

export type InvoicesView = (typeof INVOICES_VIEWS)[number];

/** The views that read the handoff queue, with the part of the queue each one shows. */
export const HANDOFF_VIEWS = {
  acknowledged: 'ACKNOWLEDGED',
  waiting: 'PENDING',
} as const satisfies Partial<Record<InvoicesView, HandoffQueueStatus>>;

export type HandoffView = keyof typeof HANDOFF_VIEWS;

/** The view the list opens on, and what the bare path shows. */
export const DEFAULT_INVOICES_VIEW: InvoicesView = 'all';

export const isHandoffView = (view: InvoicesView): view is HandoffView =>
  view in HANDOFF_VIEWS;

// Only the views other than the default are spelled out: `?view=all` is the bare
// path, and reads as it. A value that is not a view is dropped, like the rest of
// a link.
const invoicesViewSchema = z.object({
  view: z
    .enum(['overdue', 'held', 'waiting', 'acknowledged'])
    .optional()
    .catch(undefined),
});

/**
 * What the URL of the list of invoices holds. The views of invoices read the scope
 * the API applies and the filters a link starts the list on; the views of the queue
 * read nothing but themselves. Each leaves out what belongs to the other, so that a
 * link of one view does not carry the search of the other.
 */
export type InvoicesSearch = InvoiceListSeed &
  InvoiceScope & { view?: Exclude<InvoicesView, 'all'> };

export function readInvoicesSearch(
  search: Record<string, unknown>,
): InvoicesSearch {
  const { view } = invoicesViewSchema.parse(search);

  if (view && isHandoffView(view)) {
    return { view };
  }

  return {
    ...readInvoiceScope(search),
    ...readInvoiceListSeed(search),
    ...(view ? { view } : {}),
  };
}

/** The view a search asks for: none reads as every invoice. */
export const invoicesViewOf = (search: InvoicesSearch): InvoicesView =>
  search.view ?? DEFAULT_INVOICES_VIEW;

/** The part of the queue a search asks for, when its view is one of the queue's. */
export function handoffQueueOf(
  search: InvoicesSearch,
): HandoffQueueStatus | undefined {
  const view = invoicesViewOf(search);

  return isHandoffView(view) ? HANDOFF_VIEWS[view] : undefined;
}

/**
 * What the route's loader depends on, and so what it loads: always the invoices of
 * the scope (the tabs count them), and the part of the queue in the views of the
 * queue. Moving between All, Overdue and Held changes neither, so it reloads nothing.
 * Everything else in the URL is the page's, in the browser.
 */
export function readInvoicesLoaderDeps(search: Record<string, unknown>) {
  const read = readInvoicesSearch(search);

  return { queue: handoffQueueOf(read), scope: readInvoiceScope(read) };
}

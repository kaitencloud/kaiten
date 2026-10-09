import { z } from 'zod';
import { zInvoiceHandoff } from '@/api-client/zod.gen';

// The list operation takes its status as a plain string, which the API refuses
// with .InvalidStatus when it is not one of the queue's; the statuses themselves
// are those of an invoice's handoff, less the one of an invoice that is in no queue.
const zQueueStatus = zInvoiceHandoff.shape.status.exclude(['NOT_REQUIRED']);

/** Which part of the queue a page shows: what the API calls the `status` of the queue. */
export type HandoffQueueStatus = z.output<typeof zQueueStatus>;

/** What the queue opens on, and what the API reads when it is asked for no status: what waits. */
export const DEFAULT_HANDOFF_STATUS: HandoffQueueStatus = 'PENDING';

/**
 * The part of the queue the handoff view of the invoices shows (`?queue=ACKNOWLEDGED`),
 * from the schema the API generates for its status. It is not called `status`, which
 * the list of invoices already uses for the status of an invoice. A link is not an API
 * call: what is not a status is dropped, and the view opens on what waits.
 */
export const handoffSearchSchema = z.object({
  queue: zQueueStatus.optional().catch(undefined),
});

export type HandoffSearch = z.output<typeof handoffSearchSchema>;

export function readHandoffSearch(
  search: Record<string, unknown>,
): HandoffSearch {
  return handoffSearchSchema.parse(search);
}

/** The part of the queue a search asks for: none reads as what waits. */
export const handoffStatusOf = (search: HandoffSearch): HandoffQueueStatus =>
  search.queue ?? DEFAULT_HANDOFF_STATUS;

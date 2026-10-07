import { z } from 'zod';
import { zListHandoffQuery } from '@/api-client/zod.gen';

/** Which part of the queue a page shows: what the API calls the `status` of the queue. */
export type HandoffQueueStatus = NonNullable<
  z.output<typeof zListHandoffQuery>['status']
>;

/** What the queue opens on, and what the API reads when it is asked for no status: what waits. */
export const DEFAULT_HANDOFF_STATUS: HandoffQueueStatus = 'PENDING';

/**
 * The search of the page of the queue (`?status=ACKNOWLEDGED`), from the schema
 * the API generates for the status. A link is not an API call: what is not a
 * status is dropped, and the page opens on what waits.
 */
export const handoffSearchSchema = z.object({
  status: zListHandoffQuery.shape.status.catch(undefined),
});

export type HandoffSearch = z.output<typeof handoffSearchSchema>;

export function readHandoffSearch(
  search: Record<string, unknown>,
): HandoffSearch {
  return handoffSearchSchema.parse(search);
}

/** The part of the queue a search asks for: none reads as what waits. */
export const handoffStatusOf = (search: HandoffSearch): HandoffQueueStatus =>
  search.status ?? DEFAULT_HANDOFF_STATUS;

/** The search that opens a part of the queue. What waits is the bare path. */
export const toHandoffSearch = (status: HandoffQueueStatus): HandoffSearch => ({
  status: status === DEFAULT_HANDOFF_STATUS ? undefined : status,
});

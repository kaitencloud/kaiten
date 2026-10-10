import { allHandoffOptions } from '@/lib/api/all-pages-query-options';
import type { HandoffQueueStatus } from '../schemas/handoff-queue-status';

/**
 * The handoff queue in one status, read whole, oldest issue first as the API gives
 * it: the page filters, sorts and pages it like the other lists. Reading it never
 * leases an invoice: the consumers do that, with the CLI or an integration, and this
 * is only the view of what they have and have not taken. It keeps the generated key,
 * so that every action on an invoice refreshes it.
 */
export const handoffQueryOptions = (status: HandoffQueueStatus) => ({
  ...allHandoffOptions({ status }),
  retry: false,
  // A refusal the route's loader met is the answer: the route shows it, with a way
  // to ask again, instead of asking once more by itself behind it.
  retryOnMount: false,
});

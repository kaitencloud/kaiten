import type { z } from 'zod';
import { zInvoiceHandoff } from '@/api-client/zod.gen';

// The list operation takes its status as a plain string, which the API refuses
// with .InvalidStatus when it is not one of the queue's; the statuses themselves
// are those of an invoice's handoff, less the one of an invoice that is in no queue.
const zQueueStatus = zInvoiceHandoff.shape.status.exclude(['NOT_REQUIRED']);

/** Which part of the queue a page shows: what the API calls the `status` of the queue. */
export type HandoffQueueStatus = z.output<typeof zQueueStatus>;

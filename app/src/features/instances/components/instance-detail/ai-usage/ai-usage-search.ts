import { z } from 'zod';
import { zAiInference } from '@/api-client/zod.gen';

/**
 * What the URL of an instance's AI usage tab holds, so that a link opens the
 * same pool, filters and receipt, and a reload keeps them: the pool shown, the
 * feed's filters (`from` and `to` as UTC `YYYY-MM-DDTHH:mm`), and the
 * transaction whose receipt is open. What does not read as one is dropped,
 * field by field, and the tab opens with the rest.
 */
export const aiUsageSearchSchema = z.object({
  auth: z.enum(['yes', 'no']).optional().catch(undefined),
  from: z.string().trim().min(1).optional().catch(undefined),
  model: z.string().trim().min(1).optional().catch(undefined),
  pool: z.string().trim().min(1).optional().catch(undefined),
  receipt: z.string().trim().min(1).optional().catch(undefined),
  status: zAiInference.shape.status.optional().catch(undefined),
  to: z.string().trim().min(1).optional().catch(undefined),
  tx: z.string().trim().min(1).optional().catch(undefined),
  type: zAiInference.shape.requestType.optional().catch(undefined),
});

export type AiUsageSearch = z.output<typeof aiUsageSearchSchema>;

export function readAiUsageSearch(search: unknown): AiUsageSearch {
  return aiUsageSearchSchema.parse(
    search && typeof search === 'object' ? search : {},
  );
}

/** The search keys of the feed's filters, cleared together. */
export const FILTER_KEYS = [
  'auth',
  'from',
  'model',
  'status',
  'to',
  'tx',
  'type',
] as const satisfies readonly (keyof AiUsageSearch)[];

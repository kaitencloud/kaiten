import { z } from 'zod';
import { zAiInference } from '@/api-client/zod.gen';

/**
 * The cell of the rate card a link opens: `<licenseSlug>~<modelSlug>`, or
 * `<licenseSlug>~*` for the wildcard row of a version (`*` is no slug, so no
 * model can be mistaken for it).
 */
export const PRICING_CELL_PATTERN = /^[^~\s]+~[^~\s]+$/;

/**
 * What the URL of the rate card holds, so that a link opens the same view and a
 * reload keeps it: the credit pool, the licence family (`current` for each
 * family's current version) or one version deep-linked, the request type tab,
 * the search and status filter of the models, and the cell whose panel is open.
 * A link is not an API call: what does not read as one of them is dropped, field
 * by field, and the page opens with the rest.
 */
export const pricingSearchSchema = z.object({
  cell: z.string().regex(PRICING_CELL_PATTERN).optional().catch(undefined),
  family: z.string().trim().min(1).optional().catch(undefined),
  pool: z.string().trim().min(1).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  status: z.enum(['active', 'all']).optional().catch(undefined),
  type: zAiInference.shape.requestType.optional().catch(undefined),
  version: z.string().trim().min(1).optional().catch(undefined),
});

export type PricingSearch = z.output<typeof pricingSearchSchema>;

export function readPricingSearch(
  search: Record<string, unknown>,
): PricingSearch {
  return pricingSearchSchema.parse(search);
}

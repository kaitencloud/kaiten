import { z } from 'zod';
import { zListUsageReportsQuery } from '@/api-client/zod.gen';

/**
 * What the URL of the entitlements tab of an instance holds: the entitlement
 * whose usage history is open (`history`), the period it is read for (`from`
 * up to `to`, the instants the API takes it in) and, for an entitlement that
 * counts per resource, the one resource the history is narrowed to (`resource`);
 * and the entitlement whose resources are listed in their own drawer (`resources`).
 * A link is not an API call: what does not read as one of them is dropped, field by
 * field, and the tab opens with the rest. The period and the resource start from the
 * schema the API generates, so that they are the same ones the history is asked in.
 */
const api = zListUsageReportsQuery.shape;

export const entitlementsSearchSchema = z.object({
  from: api.from.catch(undefined),
  history: z.string().optional().catch(undefined),
  resource: api.resourceKey.catch(undefined),
  resources: z.string().optional().catch(undefined),
  to: api.to.catch(undefined),
});

export type EntitlementsSearch = z.output<typeof entitlementsSearchSchema>;

/** What the URL carries: the fields that are set, so that none leaves the bare path. */
export function readEntitlementsSearch(
  search: Record<string, unknown>,
): EntitlementsSearch {
  return entitlementsSearchSchema.parse(search);
}

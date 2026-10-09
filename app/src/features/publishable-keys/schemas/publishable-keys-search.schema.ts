import { z } from 'zod';
import { zListPublishableKeysQuery } from '@/api-client/zod.gen';

/**
 * What the URL of the list holds (`?includeRevoked=true`): whether the revoked keys are
 * listed too. The API reads it, so it is part of what the route loads and of the key of
 * the list in the cache, and its schema is the one the API generates. A link is not an
 * API call: a value that is not a boolean is dropped, and the page starts on the list
 * without the revoked keys.
 */
export const publishableKeysSearchSchema = z.object({
  includeRevoked:
    zListPublishableKeysQuery.shape.includeRevoked.catch(undefined),
});

export type PublishableKeysSearch = z.output<
  typeof publishableKeysSearchSchema
>;

/** The search of the list as the route reads it: `includeRevoked` only when it is on. */
export function readPublishableKeysSearch(
  search: Record<string, unknown>,
): PublishableKeysSearch {
  const { includeRevoked } = publishableKeysSearchSchema.parse(search);

  return includeRevoked ? { includeRevoked: true } : {};
}

import type { QueryClient } from '@tanstack/react-query';
import type { ListPublishableKeysResponse, PublishableKey } from '@/api-client';
import { listPublishableKeysQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { allPublishableKeysOptions } from '@/lib/api/all-billing-pages-query-options';

/**
 * The publishable keys of the organization, newest first, the revoked ones too when
 * `includeRevoked` asks for them. The API never returns a key, only its last four
 * characters, and pages the list (fifty keys a page unless asked for more): the read
 * walks every page, so that the screen holds the whole list.
 *
 * The two reads are two entries of the cache, under the generated key of the operation
 * with the query in it, so that `listPublishableKeysQueryKey()` reaches both. Neither is
 * retried: a refusal of billing is the screen's to show, with a way to ask again, and
 * one that the route's loader met is the answer.
 */
export const publishableKeysQueryOptions = (includeRevoked = false) => ({
  ...allPublishableKeysOptions(includeRevoked ? { includeRevoked: true } : {}),
  retry: false,
  retryOnMount: false,
});

/**
 * One key by its id, for the dialog that edits it. The API has no read of a single key,
 * so it is found in a list the cache already holds, the one with the revoked keys or the
 * one without, and failing that in the list with the revoked keys read now: a link that
 * opens the dialog before the page has read anything leads there. A key the API does not
 * list is none.
 */
export async function ensurePublishableKey(
  queryClient: QueryClient,
  keyId: string,
): Promise<PublishableKey | undefined> {
  for (const [
    ,
    page,
  ] of queryClient.getQueriesData<ListPublishableKeysResponse>({
    queryKey: listPublishableKeysQueryKey(),
  })) {
    const cached = page?.items.find(({ id }) => id === keyId);
    if (cached) {
      return cached;
    }
  }
  const everyKey = await queryClient.ensureQueryData(
    publishableKeysQueryOptions(true),
  );

  return everyKey.items.find(({ id }) => id === keyId);
}

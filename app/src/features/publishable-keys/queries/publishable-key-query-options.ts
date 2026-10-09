import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { listPublishableKeys, type PublishableKey } from '@/api-client';
import { listPublishableKeysQueryKey } from '@/api-client/@tanstack/react-query.gen';
import { type ListPage, toListPage } from '@/lib/api/pagination';

/**
 * The publishable keys of the organization, newest first, the revoked ones too when
 * `includeRevoked` asks for them. The API never returns a key, only its last four
 * characters, and answers a plain array where the rest of the console reads lists
 * (`{ items, hasMore }`): `toListPage` is the one place that turns one into the other, so
 * that the day the API pages them, only this read changes.
 *
 * The two reads are two entries of the cache, under the generated key of the operation
 * with the query in it, so that `listPublishableKeysQueryKey()` reaches both. Neither is
 * retried: a refusal of billing is the screen's to show, with a way to ask again, and
 * one that the route's loader met is the answer.
 */
export const publishableKeysQueryOptions = (includeRevoked = false) => {
  const options = includeRevoked
    ? { query: { includeRevoked: true } }
    : undefined;

  return queryOptions({
    queryFn: async ({ signal }) =>
      toListPage(
        (await listPublishableKeys({ ...options, signal, throwOnError: true }))
          .data,
      ),
    queryKey: listPublishableKeysQueryKey(options),
    retry: false,
    retryOnMount: false,
  });
};

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
  for (const [, page] of queryClient.getQueriesData<ListPage<PublishableKey>>({
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

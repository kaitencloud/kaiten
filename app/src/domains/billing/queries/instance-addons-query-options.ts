import { queryOptions } from '@tanstack/react-query';
import { listInstanceAddons } from '@/api-client';
import { listInstanceAddonsQueryKey } from '@/api-client/@tanstack/react-query.gen';

/**
 * Every attachment an instance has had, the ones taken off included: what names the
 * add-on a line of an invoice bills when the add-on is no longer held, since an
 * add-on removed before a boundary is still on the invoice of that boundary and the
 * plain list of the add-ons of an instance no longer has it. The key is the
 * generated one with the query appended, so the invalidation of an instance's
 * add-ons (`invalidateInstanceAddonQueries`, by `path`) reaches it as it reaches
 * the plain list. Not retried: a refusal leaves the line without a name, and the
 * line stands on its own.
 */
export const instanceAddonsWithRemovedQueryOptions = (instanceSlug: string) =>
  queryOptions({
    queryKey: listInstanceAddonsQueryKey({
      path: { instanceSlug },
      query: { includeRemoved: true },
    }),
    queryFn: async ({ signal }) =>
      (
        await listInstanceAddons({
          path: { instanceSlug },
          query: { includeRemoved: true },
          signal,
          throwOnError: true,
        })
      ).data,
    retry: false,
    retryOnMount: false,
  });

import { queryOptions } from '@tanstack/react-query';
import { listAddons, listInstanceAddons } from '@/api-client';
import {
  listAddonsQueryKey,
  listInstanceAddonsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { toListPage } from '@/lib/api/pagination';

// The add-on API answers plain arrays where the rest of the console reads lists
// (`{ items, hasMore }`). Every read of one in this feature goes through here, and
// `toListPage` is the one place that turns an array into a list, so that the day the
// API pages them, only these reads change. They keep the generated keys, so that
// the invalidation of the catalogue and of an instance reaches them.
//
// None is retried: a refusal of billing is the screen's to show, with a way to ask
// again, and one that the route's loader met is the answer. What these screens read
// about a version (its prices, the families it fits, the license families) is read
// the same way as the screens of the add-ons do, and lives in the billing domain.

/**
 * The add-ons an instance holds, in the order they were attached: what its Billing
 * tab lists and steps, and what the cancellation of its subscription offers to
 * remove.
 */
export const instanceAddonsQueryOptions = (instanceSlug: string) =>
  queryOptions({
    queryKey: listInstanceAddonsQueryKey({ path: { instanceSlug } }),
    queryFn: async ({ signal }) =>
      toListPage(
        (
          await listInstanceAddons({
            path: { instanceSlug },
            signal,
            throwOnError: true,
          })
        ).data,
      ),
    retry: false,
    retryOnMount: false,
  });

/**
 * Every version of every add-on, whatever its state: what names the add-ons an
 * instance holds, which may have been withdrawn from sale since, and what the
 * selector of an add-on to attach is drawn from, the versions on sale among them.
 */
export const addonVersionsQueryOptions = () =>
  queryOptions({
    queryKey: listAddonsQueryKey(),
    queryFn: async ({ signal }) =>
      toListPage((await listAddons({ signal, throwOnError: true })).data),
    retry: false,
    retryOnMount: false,
  });

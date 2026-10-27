import type { QueryClient } from '@tanstack/react-query';
import {
  getAddonQueryKey,
  listAddonCompatibilityQueryKey,
  listAddonEntitlementsQueryKey,
  listAddonFamiliesQueryKey,
  listAddonPricesQueryKey,
  listAddonsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import { catalogPricesBaseQueryKey } from '@/domains/billing';

/**
 * A version was created, changed, moved along its lifecycle, made the default or
 * deleted, or its family was listed in the public catalog or taken out: the
 * families and the versions they hold, which the screens of the catalogue and the
 * selector of an instance read, the versions the price picker of a voucher names, and
 * the version's own detail when it is named.
 */
export async function invalidateAddonQueries(
  queryClient: QueryClient,
  addonSlug?: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: listAddonFamiliesQueryKey() }),
    queryClient.invalidateQueries({ queryKey: listAddonsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: catalogPricesBaseQueryKey }),
    addonSlug
      ? queryClient.invalidateQueries({
          queryKey: getAddonQueryKey({ path: { addonSlug } }),
        })
      : undefined,
  ]);
}

/**
 * Every version's detail. Making a version the default of its family takes the flag
 * from the one that had it, and only the server knows which, so a stale "Default"
 * badge would otherwise survive on that version's page.
 */
export async function invalidateAddonDetails(queryClient: QueryClient) {
  const [{ _id }] = getAddonQueryKey({ path: { addonSlug: '' } });

  await queryClient.invalidateQueries({ queryKey: [{ _id }] });
}

/** What a version grants changed: its grants, the list and each one read by itself. */
export async function invalidateAddonGrantQueries(
  queryClient: QueryClient,
  addonSlug: string,
) {
  await queryClient.invalidateQueries({
    queryKey: listAddonEntitlementsQueryKey({ path: { addonSlug } }),
  });
}

/**
 * A price of a version changed: its prices, and the prices of every version, where the
 * price picker of a voucher reads them.
 */
export async function invalidateAddonPriceQueries(
  queryClient: QueryClient,
  addonSlug: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: listAddonPricesQueryKey({ path: { addonSlug } }),
    }),
    queryClient.invalidateQueries({ queryKey: catalogPricesBaseQueryKey }),
  ]);
}

/** The license families a version fits changed. */
export async function invalidateAddonCompatibilityQueries(
  queryClient: QueryClient,
  addonSlug: string,
) {
  await queryClient.invalidateQueries({
    queryKey: listAddonCompatibilityQueryKey({ path: { addonSlug } }),
  });
}

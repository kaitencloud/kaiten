import { queryOptions } from '@tanstack/react-query';
import { listAddonFamilies } from '@/api-client';
import {
  getAddonOptions,
  listAddonEntitlementsOptions,
  listAddonFamiliesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import {
  allEntitlementsOptions,
  allLicenseEntitlementsOptions,
} from '@/lib/api/all-pages-query-options';
import { toListPage } from '@/lib/api/pagination';

/**
 * Every add-on family of the organization with its versions, in the console's list
 * shape. The API answers a plain array for it, and this is the one place that turns
 * it into the shape the other lists have (`toListPage`), so that a paged answer, the
 * day it comes, is a change to this read and to nothing the screens do. It keeps the
 * generated key, so that every invalidation aimed at the operation lands.
 */
export const addonFamiliesQueryOptions = queryOptions({
  queryKey: listAddonFamiliesQueryKey(),
  queryFn: async ({ signal }) =>
    toListPage((await listAddonFamilies({ signal, throwOnError: true })).data),
});

export const addonQueryOptions = (addonSlug: string) =>
  getAddonOptions({ path: { addonSlug } });

/** What one version grants per unit of quantity. */
export const addonGrantsQueryOptions = (addonSlug: string) =>
  listAddonEntitlementsOptions({ path: { addonSlug } });

/** The entitlement catalogue a grant is picked from, and named after. */
export const entitlementsQueryOptions = allEntitlementsOptions();

/** What a license version grants: the allowance an add-on's own would replace. */
export const licenseGrantsQueryOptions = (licenseSlug: string) =>
  allLicenseEntitlementsOptions(licenseSlug);

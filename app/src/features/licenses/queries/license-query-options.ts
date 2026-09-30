import type { QueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { getInstances, getLicenses } from '@/api-client';
import {
  getLicenseEntitlementsQueryKey,
  getLicenseOptions,
  getLicenseQueryKey,
  getLicensesQueryKey,
  listLicenseFamiliesQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import {
  allEntitlementsOptions,
  allLicenseEntitlementsOptions,
  allLicenseFamiliesOptions,
  allLicensesOptions,
} from '@/lib/api/all-pages-query-options';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/pagination';
import { buildLicensesWithInstancesRows } from '../utils/license-list.utils';

export const licensesQueryOptions = allLicensesOptions();

// Every family with the version it resolves to. The console names a family,
// and starts its new versions, from that answer rather than applying the
// resolution rule to the versions itself.
export const licenseFamiliesQueryOptions = allLicenseFamiliesOptions();

export const licenseQueryOptions = (licenseSlug: string) =>
  getLicenseOptions({ path: { licenseSlug } });

export const entitlementsQueryOptions = allEntitlementsOptions();

export const licenseEntitlementsQueryOptions = (licenseSlug: string) =>
  allLicenseEntitlementsOptions(licenseSlug);

export const licensesWithInstancesBaseQueryKey = [
  'licenses',
  'with-instances',
] as const;

export const licensesWithInstancesQueryOptions = queryOptions({
  queryKey: licensesWithInstancesBaseQueryKey,
  queryFn: async ({ signal }) => {
    const page = (cursor: string | undefined) => ({
      query: { cursor, limit: MAX_PAGE_SIZE },
      signal,
      throwOnError: true as const,
    });
    const [licenses, instances] = await Promise.all([
      fetchAllPages(async (cursor) => (await getLicenses(page(cursor))).data),
      fetchAllPages(async (cursor) => (await getInstances(page(cursor))).data),
    ]);

    return buildLicensesWithInstancesRows(licenses, instances);
  },
});

// The license lists, refetched only where they are on screen: a version's own
// change touches one row of them, and a list nobody shows is simply marked
// stale for its next read. The family list is one of them: a version's state,
// default flag or name can change what its family resolves to.
export async function invalidateLicenseLists(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: getLicensesQueryKey() }),
    queryClient.invalidateQueries({
      queryKey: licensesWithInstancesBaseQueryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: listLicenseFamiliesQueryKey(),
    }),
  ]);
}

// Every license's detail. Moving a family's default changes two versions, and
// only the server knows which one lost the flag, so a stale "Default" badge
// would otherwise survive on that version's page.
export async function invalidateLicenseDetails(queryClient: QueryClient) {
  const [{ _id }] = getLicenseQueryKey({ path: { licenseSlug: '' } });
  await queryClient.invalidateQueries({ queryKey: [{ _id }] });
}

export async function invalidateLicenseQueries(
  queryClient: QueryClient,
  licenseSlug?: string,
) {
  const invalidations: Array<Promise<void>> = [
    queryClient.invalidateQueries({ queryKey: getLicensesQueryKey() }),
    queryClient.invalidateQueries({
      queryKey: licensesWithInstancesBaseQueryKey,
    }),
    queryClient.invalidateQueries({
      queryKey: listLicenseFamiliesQueryKey(),
    }),
  ];

  if (licenseSlug) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: getLicenseQueryKey({ path: { licenseSlug } }),
      }),
    );
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: getLicenseEntitlementsQueryKey({ path: { licenseSlug } }),
      }),
    );
  }

  await Promise.all(invalidations);

  const refetches: Array<Promise<unknown>> = [
    queryClient.fetchQuery(licensesQueryOptions),
    queryClient.fetchQuery(licensesWithInstancesQueryOptions),
    queryClient.fetchQuery(licenseFamiliesQueryOptions),
  ];

  if (licenseSlug) {
    refetches.push(queryClient.fetchQuery(licenseQueryOptions(licenseSlug)));
    refetches.push(
      queryClient.fetchQuery(licenseEntitlementsQueryOptions(licenseSlug)),
    );
  }

  await Promise.all(refetches);
}

import { useQuery } from '@tanstack/react-query';
import type {
  DeploymentZone,
  EntitlementUsage,
  FeatureFlag,
  Instance,
  License,
  LicenseEntitlement,
  Release,
  ServiceAccount,
  Token,
} from '@/api-client';
import {
  getEntitlementsUsageMetrics,
  getFeatureFlags,
  getInstances,
  getLicenseEntitlements,
  getLicenses,
  getServiceAccounts,
  getServiceAccountTokens,
  listDeploymentZones,
  listReleases,
} from '@/api-client';
import type {
  GetCustomersQuery,
  GetDashboardDataQuery,
  GetInstancesQuery,
  GetLicensesQuery,
} from '@/api-client/graphql/graphql';
import { graphqlClient } from '@/lib/graphql-client';
import {
  GET_CUSTOMERS,
  GET_DASHBOARD_DATA,
  GET_INSTANCES,
  GET_LICENSES,
} from './dashboard.queries';

export type DashboardSupplementaryData = {
  deploymentZones: DeploymentZone[];
  entitlementUsagesByInstanceSlug: Record<string, EntitlementUsage[]>;
  featureFlags: FeatureFlag[];
  licenseEntitlementsByLicenseSlug: Record<string, LicenseEntitlement[]>;
  releases: Release[];
  restInstances: Instance[];
  restLicenses: License[];
  serviceAccounts: ServiceAccount[];
  tokens: Token[];
};

const emptySupplementaryData: DashboardSupplementaryData = {
  deploymentZones: [],
  entitlementUsagesByInstanceSlug: {},
  featureFlags: [],
  licenseEntitlementsByLicenseSlug: {},
  releases: [],
  restInstances: [],
  restLicenses: [],
  serviceAccounts: [],
  tokens: [],
};

type DashboardSupplementaryCollections = Pick<
  DashboardSupplementaryData,
  | 'deploymentZones'
  | 'featureFlags'
  | 'releases'
  | 'restInstances'
  | 'restLicenses'
  | 'serviceAccounts'
>;

// Accepts either a bare array (endpoints not yet migrated to cursor
// pagination) or a { items } page envelope (migrated endpoints) so this
// helper doesn't need a matching edit every time another endpoint moves
// to the shared pagination.Page shape.
const safeFetchArray = async <T>(
  fn: () => Promise<{ data?: T[] | { items: T[] } | null }>,
): Promise<T[]> => {
  try {
    const { data } = await fn();
    if (!data) {
      return [];
    }
    if (Array.isArray(data)) {
      return data;
    }
    // A misbehaving backend (or a static-server HTML fallback in mocked
    // environments) can hand us a non-envelope body; treating it as empty
    // keeps one bad endpoint from failing the whole supplementary query.
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
};

const getDashboardSupplementaryQueryKey = (
  baseData: GetDashboardDataQuery | undefined,
) =>
  [
    'dashboard',
    'supplementary',
    baseData?.instances.items.length ?? 0,
    baseData?.licenses.items.length ?? 0,
  ] as const;

const getUniqueSlugs = <T extends { slug?: string | null }>(items: T[]) => {
  return [
    ...new Set(
      items
        .map((item) => item.slug)
        .filter((slug): slug is string => Boolean(slug)),
    ),
  ];
};

const fetchDashboardSupplementaryCollections = async (
  signal: AbortSignal,
): Promise<DashboardSupplementaryCollections> => {
  const [
    restInstances,
    restLicenses,
    featureFlags,
    releases,
    deploymentZones,
    serviceAccounts,
  ] = await Promise.all([
    safeFetchArray(() =>
      getInstances({
        signal,
        throwOnError: false,
      }),
    ),
    safeFetchArray(() =>
      getLicenses({
        signal,
        throwOnError: false,
      }),
    ),
    safeFetchArray(() =>
      getFeatureFlags({
        signal,
        throwOnError: false,
      }),
    ),
    safeFetchArray(() =>
      listReleases({
        signal,
        throwOnError: false,
      }),
    ),
    safeFetchArray(() =>
      listDeploymentZones({
        signal,
        throwOnError: false,
      }),
    ),
    safeFetchArray(() =>
      getServiceAccounts({
        signal,
        throwOnError: false,
      }),
    ),
  ]);

  return {
    deploymentZones,
    featureFlags,
    releases,
    restInstances,
    restLicenses,
    serviceAccounts,
  };
};

const fetchTokens = async (
  serviceAccounts: ServiceAccount[],
  signal: AbortSignal,
) => {
  const tokensCollections = await Promise.all(
    getUniqueSlugs(serviceAccounts).map((serviceAccountSlug) =>
      safeFetchArray(() =>
        getServiceAccountTokens({
          path: { serviceAccountSlug },
          signal,
          throwOnError: false,
        }),
      ),
    ),
  );

  return tokensCollections.flat();
};

const fetchLicenseEntitlementsByLicenseSlug = async (
  restLicenses: Array<{ slug?: string | null }>,
  licenses: Array<{ slug?: string | null }>,
  signal: AbortSignal,
) => {
  const licenseEntitlementsByLicenseSlug: Record<string, LicenseEntitlement[]> =
    {};
  const licenseSlugs = getUniqueSlugs(
    restLicenses.length > 0 ? restLicenses : licenses,
  );

  await Promise.all(
    licenseSlugs.map(async (licenseSlug) => {
      licenseEntitlementsByLicenseSlug[licenseSlug] = await safeFetchArray(() =>
        getLicenseEntitlements({
          path: { licenseSlug },
          signal,
          throwOnError: false,
        }),
      );
    }),
  );

  return licenseEntitlementsByLicenseSlug;
};

const fetchEntitlementUsagesByInstanceSlug = async (
  restInstances: Array<{ slug?: string | null }>,
  instances: Array<{ slug?: string | null }>,
  signal: AbortSignal,
) => {
  const entitlementUsagesByInstanceSlug: Record<string, EntitlementUsage[]> =
    {};
  const instanceSlugs = getUniqueSlugs(
    restInstances.length > 0 ? restInstances : instances,
  );

  await Promise.all(
    instanceSlugs.map(async (instanceSlug) => {
      entitlementUsagesByInstanceSlug[instanceSlug] = await safeFetchArray(() =>
        getEntitlementsUsageMetrics({
          path: { instanceSlug },
          signal,
          throwOnError: false,
        }),
      );
    }),
  );

  return entitlementUsagesByInstanceSlug;
};

const fetchDashboardSupplementaryData = async (
  baseData: GetDashboardDataQuery | undefined,
  signal: AbortSignal,
): Promise<DashboardSupplementaryData> => {
  if (!baseData) {
    return emptySupplementaryData;
  }

  const {
    deploymentZones,
    featureFlags,
    releases,
    restInstances,
    restLicenses,
    serviceAccounts,
  } = await fetchDashboardSupplementaryCollections(signal);

  const [
    tokens,
    licenseEntitlementsByLicenseSlug,
    entitlementUsagesByInstanceSlug,
  ] = await Promise.all([
    fetchTokens(serviceAccounts, signal),
    fetchLicenseEntitlementsByLicenseSlug(
      restLicenses,
      baseData.licenses.items,
      signal,
    ),
    fetchEntitlementUsagesByInstanceSlug(
      restInstances,
      baseData.instances.items,
      signal,
    ),
  ]);

  return {
    deploymentZones,
    entitlementUsagesByInstanceSlug,
    featureFlags,
    licenseEntitlementsByLicenseSlug,
    releases,
    restInstances,
    restLicenses,
    serviceAccounts,
    tokens,
  };
};

export const useDashboardData = () => {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const query = GET_DASHBOARD_DATA.toString();
      return graphqlClient.request<GetDashboardDataQuery>(query);
    },
  });
};

export const useDashboardSupplementaryData = (
  baseData: GetDashboardDataQuery | undefined,
) => {
  return useQuery({
    enabled: Boolean(baseData),
    queryKey: getDashboardSupplementaryQueryKey(baseData),
    queryFn: ({ signal }) => fetchDashboardSupplementaryData(baseData, signal),
    retry: false,
    staleTime: 60_000,
  });
};

export const useCustomers = () => {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const query = GET_CUSTOMERS.toString();
      return graphqlClient.request<GetCustomersQuery>(query);
    },
  });
};

export const useInstances = () => {
  return useQuery({
    queryKey: ['instances'],
    queryFn: async () => {
      const query = GET_INSTANCES.toString();
      return graphqlClient.request<GetInstancesQuery>(query);
    },
  });
};

export const useLicenses = () => {
  return useQuery({
    queryKey: ['licenses'],
    queryFn: async () => {
      const query = GET_LICENSES.toString();
      return graphqlClient.request<GetLicensesQuery>(query);
    },
  });
};

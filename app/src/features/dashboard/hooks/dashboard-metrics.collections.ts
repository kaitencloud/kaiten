import type { Instance, License } from '@/api-client';
import type { GetDashboardDataQuery } from '@/api-client/graphql/graphql';
import type { DashboardSupplementaryData } from '../queries/use-dashboard-data';

type GraphQlInstance = GetDashboardDataQuery['instances']['items'][number];

export type DashboardCollections = {
  activeGraphQlInstances: GraphQlInstance[];
  activeInstances: Array<Instance | GraphQlInstance>;
  customers: GetDashboardDataQuery['customers']['items'];
  featureFlags: DashboardSupplementaryData['featureFlags'];
  instances: Array<Instance | GraphQlInstance>;
  licenses: Array<License | GetDashboardDataQuery['licenses']['items'][number]>;
  releases: DashboardSupplementaryData['releases'];
  serviceAccountsCount: number;
  supplementaryData: DashboardSupplementaryData | undefined;
  tokens: DashboardSupplementaryData['tokens'];
  zones: DashboardSupplementaryData['deploymentZones'];
};

export function resolveDashboardCollections(
  data: GetDashboardDataQuery,
  supplementaryData: DashboardSupplementaryData | undefined,
): DashboardCollections {
  const customers = data.customers.items;
  const graphQlInstances = data.instances.items;
  const restInstances = supplementaryData?.restInstances ?? [];
  const restLicenses = supplementaryData?.restLicenses ?? [];
  const instances =
    restInstances.length > 0 ? [...restInstances] : [...graphQlInstances];
  const licenses =
    restLicenses.length > 0 ? [...restLicenses] : [...data.licenses.items];

  const activeInstanceSlugSet =
    restInstances.length > 0
      ? new Set(
          restInstances.flatMap((instance) =>
            instance.slug ? [instance.slug as string] : [],
          ),
        )
      : new Set(graphQlInstances.map((instance) => instance.slug));

  const activeInstances =
    restInstances.length > 0 ? restInstances : graphQlInstances;
  const activeGraphQlInstances = graphQlInstances.filter((instance) =>
    activeInstanceSlugSet.has(instance.slug),
  );

  return {
    activeGraphQlInstances,
    activeInstances,
    customers,
    featureFlags: supplementaryData?.featureFlags ?? [],
    instances,
    licenses,
    releases: supplementaryData?.releases ?? [],
    serviceAccountsCount: supplementaryData?.serviceAccounts.length ?? 0,
    supplementaryData,
    tokens: supplementaryData?.tokens ?? [],
    zones: supplementaryData?.deploymentZones ?? [],
  };
}

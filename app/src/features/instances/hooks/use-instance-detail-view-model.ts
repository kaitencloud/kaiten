import { instanceQueryOptions } from './instance-detail';
import { useInstanceDetailData } from './instance-detail/use-instance-detail-data';
import { useInstanceDetailDerivedState } from './instance-detail/use-instance-detail-derived-state';
import { useInstanceDetailMutations } from './instance-detail/use-instance-detail-mutations';

export { instanceQueryOptions };

export const useInstanceDetailViewModel = (instanceSlug: string) => {
  const {
    instance,
    customer,
    license,
    entitlements,
    entitlementUsages,
    licenseEntitlements,
    deploymentZones,
    overviewReleases,
    releases,
  } = useInstanceDetailData(instanceSlug);
  const mutations = useInstanceDetailMutations(
    instance.slug!,
    instance.integrations,
  );
  const derivedState = useInstanceDetailDerivedState({
    instance,
    entitlements,
    entitlementUsages,
    licenseEntitlements,
    deploymentZones,
    overviewReleases,
    releases,
  });

  return {
    instance,
    customer,
    license,
    // The catalogue of entitlements, which names what the instance is entitled to
    // beyond the grants of its license (an add-on can grant one alone).
    entitlements,
    // What the license of the instance grants: what the grant of an add-on to attach
    // is compared with.
    licenseEntitlements,
    ...derivedState,
    ...mutations,
  };
};

export type InstanceDetailViewModel = ReturnType<
  typeof useInstanceDetailViewModel
>;

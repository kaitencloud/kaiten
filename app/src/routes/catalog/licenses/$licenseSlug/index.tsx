import { createFileRoute } from '@tanstack/react-router';
import { useEntitlementUserFacing } from '@/features/entitlements';
import {
  entitlementsQueryOptions,
  LicenseOverviewTab,
  licenseEntitlementsQueryOptions,
} from '@/features/licenses';

export const Route = createFileRoute('/catalog/licenses/$licenseSlug/')({
  component: LicenseOverviewRoute,
  loader: async ({ context, params: { licenseSlug } }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        licenseEntitlementsQueryOptions(licenseSlug),
      ),
      context.queryClient.ensureQueryData(entitlementsQueryOptions),
    ]);
  },
});

function LicenseOverviewRoute() {
  const { licenseSlug } = Route.useParams();
  // Whether an entitlement is user facing is the entitlement's own: its feature
  // owns the write, and the grants of the version offer the switch.
  const entitlementUserFacing = useEntitlementUserFacing();

  return (
    <LicenseOverviewTab
      entitlementUserFacing={entitlementUserFacing}
      licenseSlug={licenseSlug}
    />
  );
}

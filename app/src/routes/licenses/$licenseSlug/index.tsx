import { createFileRoute } from '@tanstack/react-router';
import {
  entitlementsQueryOptions,
  LicenseOverviewTab,
  licenseEntitlementsQueryOptions,
} from '@/features/licenses';

export const Route = createFileRoute('/licenses/$licenseSlug/')({
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

  return <LicenseOverviewTab licenseSlug={licenseSlug} />;
}

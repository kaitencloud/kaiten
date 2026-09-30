import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  entitlementsQueryOptions,
  LicenseDetailPage,
  licenseEntitlementsQueryOptions,
  licenseQueryOptions,
} from '@/features/licenses';

export const Route = createFileRoute('/licenses/$licenseSlug/')({
  component: LicenseDetailRoute,
  beforeLoad: async ({ context, params: { licenseSlug } }) => {
    const license = await context.queryClient.ensureQueryData(
      licenseQueryOptions(licenseSlug),
    );
    return { getTitle: () => license.name };
  },
  loader: async ({ context, params: { licenseSlug } }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(licenseQueryOptions(licenseSlug)),
      context.queryClient.ensureQueryData(
        licenseEntitlementsQueryOptions(licenseSlug),
      ),
      context.queryClient.ensureQueryData(entitlementsQueryOptions),
    ]);
  },
});

function LicenseDetailRoute() {
  const { licenseSlug } = Route.useParams();
  const { data: license } = useSuspenseQuery(licenseQueryOptions(licenseSlug));

  return <LicenseDetailPage license={license} licenseSlug={licenseSlug} />;
}

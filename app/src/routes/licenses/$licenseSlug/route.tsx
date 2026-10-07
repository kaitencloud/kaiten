import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { LicenseDetailPage, licenseQueryOptions } from '@/features/licenses';

export const Route = createFileRoute('/licenses/$licenseSlug')({
  component: LicenseDetailRouteLayout,
  beforeLoad: async ({ context, params: { licenseSlug } }) => {
    const license = await context.queryClient.ensureQueryData(
      licenseQueryOptions(licenseSlug),
    );
    return { getTitle: () => license.name };
  },
  loader: ({ context, params: { licenseSlug } }) =>
    context.queryClient.ensureQueryData(licenseQueryOptions(licenseSlug)),
});

// The page of one version, around the tab its child route renders: its
// overview, or, where billing is, its prices. A tab loads its own data, so that
// a tab billing refuses never blanks the page.
function LicenseDetailRouteLayout() {
  const { licenseSlug } = Route.useParams();
  const { data: license } = useSuspenseQuery(licenseQueryOptions(licenseSlug));

  return (
    <LicenseDetailPage license={license} licenseSlug={licenseSlug}>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </LicenseDetailPage>
  );
}

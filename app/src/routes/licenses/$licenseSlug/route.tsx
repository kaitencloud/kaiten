import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';
import {
  LicenseCommercialDialog,
  LicenseDetailPage,
  licenseQueryOptions,
} from '@/features/licenses';

// `?mode=configure` opens the dialog the commercial fields are edited in, as it
// opens the edit dialog of the other detail pages. The search stays open: a tab
// of the version has search of its own.
const licenseDetailSearchSchema = z
  .object({
    mode: z.enum(['configure']).optional(),
  })
  .loose();

export const Route = createFileRoute('/licenses/$licenseSlug')({
  component: LicenseDetailRouteLayout,
  validateSearch: (search) => licenseDetailSearchSchema.parse(search),
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
  const navigate = useNavigate();
  const { licenseSlug } = Route.useParams();
  const { mode } = Route.useSearch();
  const { data: license } = useSuspenseQuery(licenseQueryOptions(licenseSlug));

  const closeConfigure = () => {
    void navigate({
      search: (previous) => ({ ...previous, mode: undefined }),
      to: '.',
    });
  };

  return (
    <LicenseDetailPage license={license} licenseSlug={licenseSlug}>
      {mode === 'configure' ? (
        <LicenseCommercialDialog license={license} onClose={closeConfigure} />
      ) : null}
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </LicenseDetailPage>
  );
}

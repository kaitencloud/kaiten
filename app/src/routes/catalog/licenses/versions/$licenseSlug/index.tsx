import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  entitlementsQueryOptions,
  LicenseVersionForm,
  licenseEntitlementsQueryOptions,
  licenseFamiliesQueryOptions,
  licenseQueryOptions,
  licensesQueryOptions,
} from '@/features/licenses';
import i18n from '@/lib/i18n/config';

// `?draft=true` offers the version as a draft, which a link from a version that
// cannot be changed any more uses: a draft is what can be changed.
const newVersionSearchSchema = z.object({ draft: z.boolean().optional() });

export const Route = createFileRoute(
  '/catalog/licenses/versions/$licenseSlug/',
)({
  component: NewLicenseVersionForLicenseRoute,
  validateSearch: (search) => newVersionSearchSchema.parse(search),
  beforeLoad: async ({ context, params: { licenseSlug } }) => {
    const license = await context.queryClient.ensureQueryData(
      licenseQueryOptions(licenseSlug),
    );
    // The crumb names the page, not the license it starts from: the license
    // name alone read as its detail page.
    return {
      getTitle: () =>
        i18n.t('Pages.Licenses.Version.titleNewOf', { name: license.name }),
    };
  },
  // The router runs `beforeLoad` to its end first, so the form costs two round trips: the
  // license, then these reads. Starting them beside it would leave a rejection that
  // nobody awaits when the license is missing, to save one round trip.
  loader: ({ context, params: { licenseSlug } }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(licensesQueryOptions),
      context.queryClient.ensureQueryData(licenseFamiliesQueryOptions),
      context.queryClient.ensureQueryData(licenseQueryOptions(licenseSlug)),
      context.queryClient.ensureQueryData(entitlementsQueryOptions),
      // The grants of the version the form starts from, which the new version starts
      // with. The form reads without suspending and copes with a refusal (a toast, and
      // a version with none), so a prefetch: it never throws, and is not retried so that
      // a refusal does not hold the page.
      context.queryClient.prefetchQuery({
        ...licenseEntitlementsQueryOptions(licenseSlug),
        retry: false,
      }),
    ]);
  },
});

function NewLicenseVersionForLicenseRoute() {
  const { licenseSlug } = Route.useParams();
  const { draft } = Route.useSearch();
  const { data: licenses } = useSuspenseQuery(licensesQueryOptions);
  const { data: families } = useSuspenseQuery(licenseFamiliesQueryOptions);
  const { data: license } = useSuspenseQuery(licenseQueryOptions(licenseSlug));

  if (!license) {
    return <div>License not found</div>;
  }

  return (
    <LicenseVersionForm
      availableFamilies={families?.items ?? []}
      availableLicenses={licenses?.items ?? []}
      selectedLicenseSlug={licenseSlug}
      startAsDraft={draft}
    />
  );
}

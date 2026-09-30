import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  entitlementsQueryOptions,
  LicenseVersionForm,
  licenseFamiliesQueryOptions,
  licenseQueryOptions,
  licensesQueryOptions,
} from '@/features/licenses';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/licenses/versions/$licenseSlug/')({
  component: NewLicenseVersionForLicenseRoute,
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
  loader: ({ context, params: { licenseSlug } }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(licensesQueryOptions),
      context.queryClient.ensureQueryData(licenseFamiliesQueryOptions),
      context.queryClient.ensureQueryData(licenseQueryOptions(licenseSlug)),
      context.queryClient.ensureQueryData(entitlementsQueryOptions),
    ]);
  },
});

function NewLicenseVersionForLicenseRoute() {
  const { licenseSlug } = Route.useParams();
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
    />
  );
}

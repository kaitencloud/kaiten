import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  entitlementsQueryOptions,
  LicenseVersionForm,
  licenseFamiliesQueryOptions,
  licensesQueryOptions,
} from '@/features/licenses';

export const Route = createFileRoute('/catalog/licenses/versions/new/')({
  component: NewLicenseVersionRoute,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(licensesQueryOptions),
      context.queryClient.ensureQueryData(licenseFamiliesQueryOptions),
      context.queryClient.ensureQueryData(entitlementsQueryOptions),
    ]);
  },
});

function NewLicenseVersionRoute() {
  const { data: licenses } = useSuspenseQuery(licensesQueryOptions);
  const { data: families } = useSuspenseQuery(licenseFamiliesQueryOptions);
  return (
    <LicenseVersionForm
      availableFamilies={families?.items ?? []}
      availableLicenses={licenses?.items ?? []}
    />
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { entitlementsQueryOptions, LicenseForm } from '@/features/licenses';

export const Route = createFileRoute('/licenses/new/')({
  component: NewLicenseRoute,
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(entitlementsQueryOptions);
  },
});

function NewLicenseRoute() {
  return <LicenseForm />;
}

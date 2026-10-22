import { createFileRoute } from '@tanstack/react-router';
import { ActionGate } from '@/domains/billing';
import { entitlementsQueryOptions, LicenseForm } from '@/features/licenses';

export const Route = createFileRoute('/catalog/licenses/new/')({
  component: NewLicenseRoute,
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(entitlementsQueryOptions);
  },
});

function NewLicenseRoute() {
  return (
    <ActionGate action="license.create" restricted>
      <LicenseForm />
    </ActionGate>
  );
}

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ServiceAccountCreateDialog,
  ServiceAccountsPageContent,
} from '@/features/service-accounts';

export const Route = createFileRoute('/integrations/service-accounts/new/')({
  component: NewServiceAccountRoute,
  pendingComponent: () => null,
});

function NewServiceAccountRoute() {
  const navigate = useNavigate();

  return (
    <ServiceAccountsPageContent>
      <ServiceAccountCreateDialog
        open
        onOpenChange={(open) => {
          if (!open) {
            navigate({ to: '/integrations/service-accounts' });
          }
        }}
      />
    </ServiceAccountsPageContent>
  );
}

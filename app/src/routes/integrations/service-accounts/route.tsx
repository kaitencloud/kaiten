import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { RoutePending } from '@/components/route';
import { serviceAccountsQueryOptions } from '@/features/service-accounts';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/integrations/service-accounts')({
  component: IntegrationsServiceAccountsLayout,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(serviceAccountsQueryOptions),
  beforeLoad: () => ({
    getTitle: () =>
      i18n.t('Pages.Integrations.ServiceAccounts.title', 'Service Accounts'),
  }),
  pendingComponent: () => <RoutePending />,
});

function IntegrationsServiceAccountsLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}

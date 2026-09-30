import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/integrations/connectors')({
  component: IntegrationsConnectorsLayout,
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Integrations.Connectors.title', 'Connectors'),
  }),
});

function IntegrationsConnectorsLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}

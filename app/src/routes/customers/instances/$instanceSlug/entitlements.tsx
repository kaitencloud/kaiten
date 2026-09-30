import { createFileRoute } from '@tanstack/react-router';
import { InstanceDetailEntitlementsTab } from '@/features/instances';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/entitlements',
)({
  component: InstanceDetailEntitlementsRoute,
  beforeLoad: () => ({
    getTitle: () =>
      i18n.t('Pages.Customers.Instances.Detail.tabs.entitlements'),
  }),
});

function InstanceDetailEntitlementsRoute() {
  return <InstanceDetailEntitlementsTab />;
}

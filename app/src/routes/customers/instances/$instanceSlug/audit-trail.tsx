import { createFileRoute } from '@tanstack/react-router';
import { InstanceDetailAuditTrailTab } from '@/features/instances';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/audit-trail',
)({
  component: InstanceDetailAuditTrailRoute,
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Customers.Instances.Detail.tabs.auditTrail'),
  }),
});

function InstanceDetailAuditTrailRoute() {
  return <InstanceDetailAuditTrailTab />;
}

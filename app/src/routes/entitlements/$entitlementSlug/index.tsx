import { createFileRoute } from '@tanstack/react-router';
import { EntitlementDetailOverviewTab } from '@/features/entitlements';

export const Route = createFileRoute('/entitlements/$entitlementSlug/')({
  component: EntitlementDetailOverviewRoute,
});

function EntitlementDetailOverviewRoute() {
  return <EntitlementDetailOverviewTab />;
}

import { createFileRoute } from '@tanstack/react-router';
import { InstanceDetailOverviewTab } from '@/features/instances';

export const Route = createFileRoute('/customers/instances/$instanceSlug/')({
  component: InstanceDetailOverviewRoute,
});

function InstanceDetailOverviewRoute() {
  return <InstanceDetailOverviewTab />;
}

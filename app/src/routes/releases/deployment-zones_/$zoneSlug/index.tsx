import { createFileRoute } from '@tanstack/react-router';
import { DeploymentZoneDetailOverviewTab } from '@/features/deployment-zones';

export const Route = createFileRoute('/releases/deployment-zones_/$zoneSlug/')({
  component: DeploymentZoneDetailOverviewRoute,
});

function DeploymentZoneDetailOverviewRoute() {
  return <DeploymentZoneDetailOverviewTab />;
}

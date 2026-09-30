import { createFileRoute } from '@tanstack/react-router';
import { FeatureFlagForm } from '@/features/feature-flags';

export const Route = createFileRoute('/feature-flags/new/')({
  component: RouteComponent,
});

function RouteComponent() {
  return <FeatureFlagForm />;
}

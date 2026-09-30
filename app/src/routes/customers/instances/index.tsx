import { createFileRoute } from '@tanstack/react-router';
import { InstancesPageContent } from '@/features/instances';

export const Route = createFileRoute('/customers/instances/')({
  component: InstancesPageContent,
});

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/releases/deployment-zone/')({
  beforeLoad: () => {
    throw redirect({ to: '/releases/deployment-zones' });
  },
});

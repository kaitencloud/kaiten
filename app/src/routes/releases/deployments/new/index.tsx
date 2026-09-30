import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/releases/deployments/new/')({
  beforeLoad: () => {
    throw redirect({
      replace: true,
      to: '/releases/new',
    });
  },
});

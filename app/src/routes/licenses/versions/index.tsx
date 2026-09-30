import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/licenses/versions/')({
  beforeLoad: () => {
    throw redirect({
      to: '/licenses',
    });
  },
});

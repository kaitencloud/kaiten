import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/catalog/licenses/versions/')({
  beforeLoad: () => {
    throw redirect({
      to: '/catalog/licenses',
    });
  },
});

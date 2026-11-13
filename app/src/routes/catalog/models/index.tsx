import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/catalog/models/')({
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/ai/models', search, replace: true });
  },
});

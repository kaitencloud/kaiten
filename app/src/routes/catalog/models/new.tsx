import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/catalog/models/new')({
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/ai/models/new', search, replace: true });
  },
});

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/catalog/models/import')({
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/ai/models/import', search, replace: true });
  },
});

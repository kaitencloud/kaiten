import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/customers/instances/$instanceSlug/edit')(
  {
    beforeLoad: ({ params: { instanceSlug } }) => {
      throw redirect({
        to: '/customers/instances/$instanceSlug',
        params: { instanceSlug },
        replace: true,
        search: (prev) => ({
          ...(prev as Record<string, unknown>),
          mode: 'configure',
        }),
      });
    },
  },
);

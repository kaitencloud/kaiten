import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/catalog/models/$modelSlug/source')({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/ai/models/$modelSlug/source',
      params,
      search,
      replace: true,
    });
  },
});

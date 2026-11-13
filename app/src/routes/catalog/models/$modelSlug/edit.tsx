import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/catalog/models/$modelSlug/edit')({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/ai/models/$modelSlug/edit',
      params,
      search,
      replace: true,
    });
  },
});

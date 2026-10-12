import { createFileRoute, redirect } from '@tanstack/react-router';

// /catalog is a section, not a page: it opens on its first entry, which the
// side nav links to as well.
export const Route = createFileRoute('/catalog/')({
  beforeLoad: () => {
    throw redirect({ replace: true, to: '/catalog/licenses' });
  },
});

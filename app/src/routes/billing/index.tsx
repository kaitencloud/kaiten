import { createFileRoute, redirect } from '@tanstack/react-router';

// /billing is a section, not a page: it opens on its first entry, which the
// side nav links to as well.
export const Route = createFileRoute('/billing/')({
  beforeLoad: () => {
    throw redirect({ replace: true, to: '/billing/invoices' });
  },
});

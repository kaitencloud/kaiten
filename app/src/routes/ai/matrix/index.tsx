import { createFileRoute, redirect } from '@tanstack/react-router';
import { aiNavigationSearchSchema } from '@/domains/ai-credits';

// The conversion matrix became the rate card: an old link opens the same pool and
// version there.
export const Route = createFileRoute('/ai/matrix/')({
  validateSearch: (search) => aiNavigationSearchSchema.parse(search),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/ai/pricing',
      search: { pool: search.entitlementSlug, version: search.licenseSlug },
      replace: true,
    });
  },
});

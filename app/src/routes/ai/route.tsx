import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
import { aiCreditsFlagQueryOptions } from '@/lib/feature-flags';
import i18n from '@/lib/i18n/config';
export const Route = createFileRoute('/ai')({
  component: Outlet,
  beforeLoad: async ({ context }) => {
    if (!(await context.queryClient.ensureQueryData(aiCreditsFlagQueryOptions)))
      throw notFound();
    return { getTitle: () => i18n.t('AI.title') };
  },
});

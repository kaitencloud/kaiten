import { requireAiAccess } from '@/domains/ai-credits';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import i18n from '@/lib/i18n/config';
export const Route = createFileRoute('/ai')({
  component: Outlet,
  beforeLoad: async ({ context }) => {
    await requireAiAccess(context.queryClient);
    return { getTitle: () => i18n.t('AI.title') };
  },
});

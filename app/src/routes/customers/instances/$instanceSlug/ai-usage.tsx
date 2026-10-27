import { createFileRoute } from '@tanstack/react-router';
import { InstanceAiUsageTab } from '@/features/instances';
import { requireAiAccess } from '@/domains/ai-credits';
import i18n from '@/lib/i18n/config';
export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/ai-usage',
)({
  component: InstanceAiUsageTab,
  beforeLoad: async ({ context }) => {
    await requireAiAccess(context.queryClient);
    return { getTitle: () => i18n.t('AI.Usage.title') };
  },
});

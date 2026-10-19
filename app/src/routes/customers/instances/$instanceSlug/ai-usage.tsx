import { createFileRoute, notFound } from '@tanstack/react-router';
import { InstanceAiUsageTab } from '@/features/instances';
import { aiCreditsFlagQueryOptions } from '@/lib/feature-flags';
import i18n from '@/lib/i18n/config';
export const Route = createFileRoute(
  '/customers/instances/$instanceSlug/ai-usage',
)({
  component: InstanceAiUsageTab,
  beforeLoad: async ({ context }) => {
    if (!(await context.queryClient.ensureQueryData(aiCreditsFlagQueryOptions)))
      throw notFound();
    return { getTitle: () => i18n.t('AI.Usage.title') };
  },
});

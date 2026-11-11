import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { requireAiAccess } from '@/domains/ai-credits';
import { EntitlementDetailPricingTab } from '@/features/entitlements';
import i18n from '@/lib/i18n/config';

// `?version=` names the licence version the tab shows first.
const pricingTabSearchSchema = z.object({
  version: z.string().trim().min(1).optional().catch(undefined),
});

export const Route = createFileRoute(
  '/catalog/entitlements/$entitlementSlug/pricing',
)({
  validateSearch: (search) => pricingTabSearchSchema.parse(search),
  beforeLoad: async ({ context }) => {
    await requireAiAccess(context.queryClient);
    return { getTitle: () => i18n.t('AI.Pool.pricingTab') };
  },
  component: PricingTabRoute,
});

function PricingTabRoute() {
  return <EntitlementDetailPricingTab version={Route.useSearch().version} />;
}

import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { requireAiAccess } from '@/domains/ai-credits';

// The Calculation tab became the Pricing tab: old links keep working, the
// licence version they named becomes the one the Pricing tab highlights.
const calculationSearchSchema = z.object({
  licenseSlug: z.string().trim().min(1).optional().catch(undefined),
});

export const Route = createFileRoute(
  '/catalog/entitlements/$entitlementSlug/calculation',
)({
  validateSearch: (search) => calculationSearchSchema.parse(search),
  beforeLoad: async ({ context, params, search }) => {
    await requireAiAccess(context.queryClient);
    throw redirect({
      to: '/catalog/entitlements/$entitlementSlug/pricing',
      params,
      search: { version: search.licenseSlug },
      replace: true,
    });
  },
});

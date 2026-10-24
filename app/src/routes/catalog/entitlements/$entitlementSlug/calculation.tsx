import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { EntitlementDetailCalculationTab } from '@/features/entitlements';
import i18n from '@/lib/i18n/config';

const calculationSearchSchema = z.object({
  licenseSlug: z.string().optional(),
  rule: z.string().optional(),
});
export const Route = createFileRoute(
  '/catalog/entitlements/$entitlementSlug/calculation',
)({
  validateSearch: (search) => calculationSearchSchema.parse(search),
  beforeLoad: () => ({ getTitle: () => i18n.t('AI.Calculation.title') }),
  component: CalculationRoute,
});
function CalculationRoute() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  return (
    <EntitlementDetailCalculationTab
      {...search}
      onSelectionChange={(selection) => {
        void navigate({
          to: '/catalog/entitlements/$entitlementSlug/calculation',
          params,
          search: selection,
        });
      }}
    />
  );
}

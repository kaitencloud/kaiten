import { requireAiAccess } from '@/domains/ai-credits';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AiCatalogueLayout } from '@/features/ai';
import { aiNavigationSearchSchema } from '@/domains/ai-credits';
import i18n from '@/lib/i18n/config';
export const Route = createFileRoute('/catalog/models')({
  validateSearch: (search) => aiNavigationSearchSchema.parse(search),
  beforeLoad: async ({ context }) => {
    await requireAiAccess(context.queryClient);
    return { getTitle: () => i18n.t('AI.Models.title') };
  },
  component: ModelsLayout,
});
function ModelsLayout() {
  return (
    <AiCatalogueLayout context={Route.useSearch()}>
      <Outlet />
    </AiCatalogueLayout>
  );
}

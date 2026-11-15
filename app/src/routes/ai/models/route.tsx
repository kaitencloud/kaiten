import { createFileRoute, Outlet } from '@tanstack/react-router';
import { aiNavigationSearchSchema } from '@/domains/ai-credits';
import { AiCatalogueLayout } from '@/features/ai';
import i18n from '@/lib/i18n/config';

// The models a pool's rules price. The `/ai` route guards the whole area.
export const Route = createFileRoute('/ai/models')({
  validateSearch: (search) => aiNavigationSearchSchema.parse(search),
  beforeLoad: () => ({ getTitle: () => i18n.t('AI.Models.title') }),
  component: ModelsLayout,
});

function ModelsLayout() {
  return (
    <AiCatalogueLayout context={Route.useSearch()}>
      <Outlet />
    </AiCatalogueLayout>
  );
}

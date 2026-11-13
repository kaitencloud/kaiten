import { createFileRoute } from '@tanstack/react-router';
import { ModelSourcePage } from '@/features/ai';
export const Route = createFileRoute('/catalog/models/$modelSlug/source')({
  component: SourcePage,
});
function SourcePage() {
  const { modelSlug } = Route.useParams();
  return <ModelSourcePage modelSlug={modelSlug} />;
}

import { createFileRoute } from '@tanstack/react-router';
import { ModelSourcePage } from '@/features/ai';

export const Route = createFileRoute('/ai/models/$modelSlug/source')({
  component: ModelSourceRoute,
});

function ModelSourceRoute() {
  return <ModelSourcePage modelSlug={Route.useParams().modelSlug} />;
}

import { createFileRoute } from '@tanstack/react-router';
import { ModelEditorPage } from '@/features/ai';

export const Route = createFileRoute('/ai/models/$modelSlug/edit')({
  component: EditModelRoute,
});

function EditModelRoute() {
  return <ModelEditorPage modelSlug={Route.useParams().modelSlug} />;
}

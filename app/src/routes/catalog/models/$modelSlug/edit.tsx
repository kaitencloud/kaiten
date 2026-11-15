import { createFileRoute } from '@tanstack/react-router';
import { ModelEditorPage } from '@/features/ai';
export const Route = createFileRoute('/catalog/models/$modelSlug/edit')({
  component: EditModel,
});
function EditModel() {
  return <ModelEditorPage modelSlug={Route.useParams().modelSlug} />;
}

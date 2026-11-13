import { createFileRoute } from '@tanstack/react-router';
import { ModelEditorPage } from '@/features/ai';
export const Route = createFileRoute('/catalog/models/new')({
  component: ModelEditorPage,
});

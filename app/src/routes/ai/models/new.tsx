import { createFileRoute } from '@tanstack/react-router';
import { ModelEditorPage } from '@/features/ai';

export const Route = createFileRoute('/ai/models/new')({
  component: ModelEditorPage,
});

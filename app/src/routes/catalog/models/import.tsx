import { createFileRoute } from '@tanstack/react-router';
import { ModelImportPage } from '@/features/ai';
export const Route = createFileRoute('/catalog/models/import')({
  component: ModelImportPage,
});

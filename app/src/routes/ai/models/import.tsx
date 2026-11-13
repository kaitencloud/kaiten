import { createFileRoute } from '@tanstack/react-router';
import { ModelImportPage } from '@/features/ai';

export const Route = createFileRoute('/ai/models/import')({
  component: ModelImportPage,
});

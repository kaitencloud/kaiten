import { createFileRoute } from '@tanstack/react-router';
import { ModelsPage } from '@/features/ai';

export const Route = createFileRoute('/ai/models/')({
  component: ModelsPage,
});

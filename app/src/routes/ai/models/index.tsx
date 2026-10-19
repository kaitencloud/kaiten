import { createFileRoute } from '@tanstack/react-router';
import { ModelsPage, modelsQueryOptions } from '@/features/ai';
export const Route = createFileRoute('/ai/models/')({
  component: ModelsPage,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(modelsQueryOptions),
});

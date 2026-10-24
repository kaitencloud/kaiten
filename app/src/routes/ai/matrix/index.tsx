import { createFileRoute } from '@tanstack/react-router';
import {
  AiNavigationProvider,
  aiNavigationSearchSchema,
} from '@/domains/ai-credits';
import { MatrixPage } from '@/features/ai';
export const Route = createFileRoute('/ai/matrix/')({
  validateSearch: (search) => aiNavigationSearchSchema.parse(search),
  component: MatrixRoute,
});
function MatrixRoute() {
  return (
    <AiNavigationProvider context={Route.useSearch()}>
      <MatrixPage />
    </AiNavigationProvider>
  );
}

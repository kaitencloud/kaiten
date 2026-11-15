import { createFileRoute, redirect } from '@tanstack/react-router';
import { aiNavigationSearchSchema } from '@/domains/ai-credits';
export const Route = createFileRoute('/ai/models/new')({
  validateSearch: (search) => aiNavigationSearchSchema.parse(search),
  beforeLoad: ({ search, params }) => {
    throw redirect({ to: '/catalog/models/new', search, params });
  },
});

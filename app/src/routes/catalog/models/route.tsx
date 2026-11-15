import { createFileRoute, Outlet } from '@tanstack/react-router';
import { aiNavigationSearchSchema } from '@/domains/ai-credits';

// The models moved to the AI area (`/ai/models`): every page under here redirects
// there with its parameters and its entitlement/version context.
export const Route = createFileRoute('/catalog/models')({
  validateSearch: (search) => aiNavigationSearchSchema.parse(search),
  component: Outlet,
});

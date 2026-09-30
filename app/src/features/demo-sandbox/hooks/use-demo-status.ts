import { useQuery } from '@tanstack/react-query';
import { getDemoStatus } from '../demo-sandbox.api';

export const demoStatusQueryKey = ['demo-sandbox', 'demo-status'] as const;

// Polls GET /demo/status while a seed/reset run is in progress so the banner
// and settings card pick up completion without a manual refresh, and stops
// polling once the org is idle again.
export function useDemoStatus() {
  return useQuery({
    queryKey: demoStatusQueryKey,
    queryFn: ({ signal }) => getDemoStatus(signal),
    refetchInterval: (query) => (query.state.data?.seeding ? 5000 : false),
  });
}

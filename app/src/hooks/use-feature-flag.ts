import { useQuery } from '@tanstack/react-query';
import { demoSandboxFlagQueryOptions } from '@/lib/feature-flags';

/**
 * Whether this organization is a demo sandbox, which shows the demo banner and
 * the seed/reset card.
 *
 * Returns `false` while the evaluation is in flight, so the banner appears once
 * rather than flashing in and out.
 */
export function useDemoSandboxEnabled(): boolean {
  return useQuery(demoSandboxFlagQueryOptions).data ?? false;
}

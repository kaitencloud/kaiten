import { useQuery } from '@tanstack/react-query';
import {
  demoSandboxFlagQueryOptions,
  planBillingFlagQueryOptions,
} from '@/lib/feature-flags';

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

/**
 * Whether this organization has the Plan & usage page. `false` while the
 * evaluation is in flight, so its card appears once rather than flashing.
 */
export function usePlanBillingEnabled(): boolean {
  return useQuery(planBillingFlagQueryOptions).data ?? false;
}

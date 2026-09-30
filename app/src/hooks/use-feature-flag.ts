import { useQueries, useQuery } from '@tanstack/react-query';
import {
  demoSandboxFlagQueryOptions,
  type PlatformFlag,
  platformFlagQueryOptions,
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
 * Which of `flags` are on, for a list whose entries each name the flag they
 * need -- nav entries, token scopes -- and so cannot call one hook per entry.
 *
 * One `useQueries` over the flags, sharing each flag's cache entry with
 * `platformFlagQueryOptions`, so a route guard's `ensureQueryData` and this hook
 * read the same answer. A flag still being evaluated counts as off, like
 * `useDemoSandboxEnabled`.
 */
export function useEnabledPlatformFlags(
  flags: readonly PlatformFlag[],
): ReadonlySet<PlatformFlag> {
  return useQueries({
    queries: flags.map((flag) => platformFlagQueryOptions(flag)),
    combine: (results) =>
      new Set(flags.filter((_, index) => results[index]?.data === true)),
  });
}

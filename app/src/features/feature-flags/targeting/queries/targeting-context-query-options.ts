import { getTargetingContextOptions } from '@/api-client/@tanstack/react-query.gen';

/**
 * What a targeting rule may read, for the editor to complete and document.
 *
 * Held for a while: the shape only moves when the server ships new facts, and
 * the slugs only when the organization's entitlements change. Re-fetching it
 * per form would cost a round trip on every dialog for an answer that is the
 * same all day.
 */
export const targetingContextQueryOptions = {
  ...getTargetingContextOptions(),
  staleTime: 5 * 60 * 1000,
};

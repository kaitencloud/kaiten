import type { QueryClient } from '@tanstack/react-query';
import { listPublishableKeysQueryKey } from '@/api-client/@tanstack/react-query.gen';

/**
 * The keys changed (issued, edited, revoked): every list of them, with the revoked
 * keys or without. The key matches by prefix, so that both reads of the list are reached.
 */
export async function invalidatePublishableKeyQueries(
  queryClient: QueryClient,
) {
  await queryClient.invalidateQueries({
    queryKey: listPublishableKeysQueryKey(),
  });
}

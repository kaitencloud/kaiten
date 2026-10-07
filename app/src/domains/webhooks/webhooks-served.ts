import { queryOptions, useQuery } from '@tanstack/react-query';
import { client } from '@/api-client/client.gen';
import { isForbiddenError, isNotFoundError } from '@/lib/errors';

/**
 * Whether outbound webhooks are served to this organization, read off the one
 * place that knows: `GET /webhooks`, which only Kaiten Cloud's saas-api answers.
 *
 * - It answers: they are, and the console shows the webhooks pages, their nav
 *   entry and the `webhooks` token scope.
 * - 404: nothing serves them here. A self-hosted deployment has no saas-api, so
 *   the path does not exist.
 * - 403: they are served, but not to this caller. saas-api refuses an
 *   organization whose Kaiten licence does not carry the `webhooks`
 *   entitlement (`Webhooks.NotEntitled`), and a caller without `read:webhooks`.
 *
 * Anything else -- the licence could not be read (503), the network failed --
 * is not an answer, and the query fails instead of caching "not served": a
 * route guard shows the retryable error page, and the nav entry comes back with
 * the next successful read.
 */
export async function getWebhooksServed(): Promise<boolean> {
  try {
    await client.get<{ 200: unknown }, unknown, true>({
      url: '/webhooks',
      throwOnError: true,
    });

    return true;
  } catch (error) {
    if (isNotFoundError(error) || isForbiddenError(error)) {
      return false;
    }

    throw error;
  }
}

export const webhooksServedQueryOptions = queryOptions({
  // Not under the webhooks feature's ['webhooks'] keys: its mutations
  // invalidate those, and creating a webhook says nothing about whether
  // webhooks are served.
  queryKey: ['webhooks-served'] as const,
  queryFn: getWebhooksServed,
  // A licence changes when somebody buys something, not between two
  // navigations, and every read reaches the licence on Kaiten's side.
  staleTime: 5 * 60_000,
  // A failed read is this attempt's answer: the next mount or navigation asks
  // again, rather than a retry loop against a service that is down.
  retry: false,
});

/**
 * Whether outbound webhooks are served to this organization, for a list whose
 * entries depend on it: the Integrations nav, the token scopes.
 *
 * `false` while the answer is being read or could not be read, so an entry
 * appears once rather than flashing in and out.
 */
export function useWebhooksServed(): boolean {
  return useQuery(webhooksServedQueryOptions).data ?? false;
}

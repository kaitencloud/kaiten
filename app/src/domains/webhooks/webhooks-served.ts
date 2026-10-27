import { queryOptions, useQuery } from '@tanstack/react-query';
import { client } from '@/api-client/client.gen';
import env from '@/env';
import { isForbiddenError, isNotFoundError } from '@/lib/errors';

/**
 * Whether this build can be served webhooks at all, before anything is asked.
 *
 * - Kaiten Cloud's builds name their platform (`VITE_KAITEN_PLATFORM_API_URL`),
 *   and Cloud is where saas-api, the only service that answers `/webhooks`,
 *   runs. The answer then comes from the route, per organization.
 * - A self-hosted build names none and has no saas-api: nothing to ask.
 * - A dev server or an e2e build cannot tell Cloud from self-hosted by itself, so
 *   `VITE_KAITEN_WEBHOOKS=true` says that a saas-api answers behind it (the
 *   Playwright app suite sets it; `dev:mock` and a dev server over the
 *   open-source stack do not).
 *
 * `VITE_KAITEN_WEBHOOKS` is read from `import.meta.env` here rather than through
 * `@/env`: it is a build switch for dev and e2e builds, not a deployment setting
 * that a container fills in at start-up.
 */
export function webhooksCanBeServed(): boolean {
  return (
    Boolean(env.PLATFORM_API_URL) ||
    import.meta.env.VITE_KAITEN_WEBHOOKS === 'true'
  );
}

/**
 * Whether outbound webhooks are served to this organization, read off the one
 * place that knows: `GET /webhooks`, which only Kaiten Cloud's saas-api answers.
 *
 * - It answers: they are, and the console shows the webhooks pages, their nav
 *   entry and the `webhooks` token scope.
 * - 404: nothing serves them here. A self-hosted deployment has no saas-api, so
 *   the path does not exist.
 * - 403: they are served, but not to this caller. saas-api refuses an
 *   organization whose Kaiten licence grants it 0 events of the `webhooks`
 *   quota (`Webhooks.NotEntitled`) -- with nothing to publish, there is
 *   nothing to configure -- and a caller without `read:webhooks`. Any other
 *   grant serves them; how many events are then published each month is
 *   counted by saas-api on delivery.
 *
 * Anything else -- the licence could not be read (503), the network failed --
 * is not an answer, and the query fails instead of caching "not served": a
 * route guard shows the retryable error page, and the nav entry comes back with
 * the next successful read.
 *
 * The path is not even asked where `webhooksCanBeServed` says no: a request that
 * can only end in a 404 is a red line in the network tab of every page.
 */
export async function getWebhooksServed(): Promise<boolean> {
  if (!webhooksCanBeServed()) {
    return false;
  }

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

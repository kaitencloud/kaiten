import { QueryClient } from '@tanstack/react-query';
import { isNotFound } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vite-plus/test';
import { webhooksServedQueryOptions } from '@/domains/webhooks';
import { Route as NewWebhookRoute } from './new/index';

// The form pages leave the layout of the list and the history (`webhooks_`), and
// so its guard: each asks for itself. No request is made: the answer is cached.
vi.mock('@/api-client/client.gen', () => ({
  client: { get: vi.fn() },
}));

const beforeLoadOf = (route: typeof NewWebhookRoute) =>
  route.options.beforeLoad as unknown as (options: {
    context: { queryClient: QueryClient };
  }) => Promise<unknown>;

function guardWith(webhooksServed: boolean) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(webhooksServedQueryOptions.queryKey, webhooksServed);
  return beforeLoadOf(NewWebhookRoute)({ context: { queryClient } }).then(
    () => 'opened',
    (error: unknown) => error,
  );
}

describe('/integrations/webhooks/new guard', () => {
  it('opens where webhooks are served', async () => {
    await expect(guardWith(true)).resolves.toBe('opened');
  });

  it('is not found where webhooks are not served', async () => {
    expect(isNotFound(await guardWith(false))).toBe(true);
  });
});

import { QueryClient } from '@tanstack/react-query';
import { isNotFound } from '@tanstack/react-router';
import { describe, expect, it } from 'vite-plus/test';
import { webhooksFlagQueryOptions } from '@/lib/feature-flags';
import { Route } from './route';

const beforeLoad = Route.options.beforeLoad as unknown as (options: {
  context: { queryClient: QueryClient };
}) => Promise<{ getTitle: () => string }>;

function guardWith(webhooksEnabled: boolean) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(webhooksFlagQueryOptions.queryKey, webhooksEnabled);
  return beforeLoad({ context: { queryClient } });
}

describe('/integrations/webhooks guard', () => {
  it('opens where the webhooks flag is on', async () => {
    const context = await guardWith(true);

    expect(context.getTitle()).toBe('Webhooks');
  });

  // Also what a failed evaluation lands on: the flag's query resolves false
  // rather than throwing (see lib/__tests__/feature-flags.test.ts).
  it('is not found where the webhooks flag is off', async () => {
    const outcome = await guardWith(false).then(
      () => 'opened',
      (error: unknown) => error,
    );

    expect(isNotFound(outcome)).toBe(true);
  });
});

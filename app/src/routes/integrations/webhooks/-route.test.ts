import { QueryClient } from '@tanstack/react-query';
import { isNotFound } from '@tanstack/react-router';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { webhooksServedQueryOptions } from '@/domains/webhooks';
import { ApiError } from '@/lib/errors';
import { Route } from './route';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

// What the guard asks when nothing is cached: GET /webhooks.
vi.mock('@/api-client/client.gen', () => ({
  client: { get: getMock },
}));

const beforeLoad = Route.options.beforeLoad as unknown as (options: {
  context: { queryClient: QueryClient };
}) => Promise<{ getTitle: () => string }>;

function guardWith(webhooksServed: boolean) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(webhooksServedQueryOptions.queryKey, webhooksServed);
  return beforeLoad({ context: { queryClient } });
}

const outcomeOf = (guard: Promise<unknown>) =>
  guard.then(
    () => 'opened',
    (error: unknown) => error,
  );

describe('/integrations/webhooks guard', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('opens where webhooks are served', async () => {
    const context = await guardWith(true);

    expect(context.getTitle()).toBe('Webhooks');
  });

  // A self-hosted deployment (no saas-api: 404), or an organization whose
  // licence does not carry webhooks (saas-api refuses it: 403).
  it('is not found where they are not', async () => {
    expect(isNotFound(await outcomeOf(guardWith(false)))).toBe(true);
  });

  it('asks GET /webhooks when nothing says yet', async () => {
    getMock.mockRejectedValue(
      new ApiError({ status: 403, data: { code: 'Webhooks.NotEntitled' } }),
    );

    const outcome = await outcomeOf(
      beforeLoad({ context: { queryClient: new QueryClient() } }),
    );

    expect(isNotFound(outcome)).toBe(true);
    expect(getMock).toHaveBeenCalledOnce();
  });

  // The licence could not be read: the router's retryable error page, not a
  // claim that the pages do not exist.
  it('fails where the answer could not be read', async () => {
    const unavailable = new ApiError({
      status: 503,
      data: { code: 'Webhooks.EntitlementVerificationUnavailable' },
    });
    getMock.mockRejectedValue(unavailable);

    const outcome = await outcomeOf(
      beforeLoad({ context: { queryClient: new QueryClient() } }),
    );

    expect(outcome).toBe(unavailable);
  });
});

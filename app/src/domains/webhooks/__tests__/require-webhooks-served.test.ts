import { QueryClient } from '@tanstack/react-query';
import { isNotFound } from '@tanstack/react-router';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import {
  requireWebhooksServed,
  webhooksServedQueryOptions,
} from '../webhooks-served';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

// What the guard asks when nothing is cached: GET /webhooks.
vi.mock('@/api-client/client.gen', () => ({
  client: { get: getMock },
}));

// A Kaiten Cloud build, which names its platform and so may be served webhooks.
vi.mock('@/env', () => ({
  default: { PLATFORM_API_URL: 'https://platform.test/api' },
}));

const outcomeOf = (guard: Promise<unknown>) =>
  guard.then(
    () => 'opened',
    (error: unknown) => error,
  );

describe('requireWebhooksServed', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('opens where webhooks are served', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(webhooksServedQueryOptions.queryKey, true);

    await expect(outcomeOf(requireWebhooksServed(queryClient))).resolves.toBe(
      'opened',
    );
    expect(getMock).not.toHaveBeenCalled();
  });

  it('says the page does not exist where webhooks are not served', async () => {
    const queryClient = new QueryClient();
    getMock.mockRejectedValue(
      new ApiError({ status: 404, data: { status: 404 } }),
    );

    const outcome = await outcomeOf(requireWebhooksServed(queryClient));

    expect(isNotFound(outcome)).toBe(true);
  });

  it('lets a read that failed reach the router, rather than claiming not found', async () => {
    const queryClient = new QueryClient();
    const unavailable = new ApiError({
      status: 503,
      data: {
        status: 503,
        code: 'Webhooks.EntitlementVerificationUnavailable',
      },
    });
    getMock.mockRejectedValue(unavailable);

    const outcome = await outcomeOf(requireWebhooksServed(queryClient));

    expect(outcome).toBe(unavailable);
    expect(isNotFound(outcome)).toBe(false);
  });
});

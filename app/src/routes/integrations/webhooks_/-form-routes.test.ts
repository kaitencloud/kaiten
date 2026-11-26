import { QueryClient } from '@tanstack/react-query';
import { isNotFound } from '@tanstack/react-router';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { client } from '@/api-client/client.gen';
import { webhooksServedQueryOptions } from '@/domains/webhooks';
import { webhooksQueryOptions } from '@/features/webhooks';
import { ApiError, isNotFoundError } from '@/lib/errors';
import { Route as EditWebhookRoute } from './$webhookId/edit';
import { Route as NewWebhookRoute } from './new/index';

// The form pages leave the layout of the list and the history (`webhooks_`), and
// so its guard: each asks for itself. The answers are cached, so no request is
// made, except the read by id of a webhook the list does not carry.
vi.mock('@/api-client/client.gen', () => ({
  client: { get: vi.fn() },
}));

const getMock = vi.mocked(client.get);

type GuardOptions = {
  context: { queryClient: QueryClient };
  params?: { webhookId: string };
};

const beforeLoadOf = (route: typeof NewWebhookRoute | typeof EditWebhookRoute) =>
  route.options.beforeLoad as unknown as (
    options: GuardOptions,
  ) => Promise<unknown>;

const listed = {
  id: 'ep_listed',
  url: 'https://hooks.slack.com/services/T000/B000/secret-path',
  eventTypes: ['com.kaiten.customer.v1.created'],
};

function queryClientWith(webhooksServed: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(webhooksServedQueryOptions.queryKey, webhooksServed);
  queryClient.setQueryData(webhooksQueryOptions.queryKey, [listed]);
  return queryClient;
}

function settle(promise: Promise<unknown>) {
  return promise.then(
    (value) => ({ opened: value }),
    (error: unknown) => ({ error }),
  );
}

describe('/integrations/webhooks/new guard', () => {
  const guardWith = (webhooksServed: boolean) =>
    settle(
      beforeLoadOf(NewWebhookRoute)({
        context: { queryClient: queryClientWith(webhooksServed) },
      }),
    );

  it('opens where webhooks are served', async () => {
    expect(await guardWith(true)).toHaveProperty('opened');
  });

  it('is not found where webhooks are not served', async () => {
    const outcome = await guardWith(false);
    expect('error' in outcome && isNotFound(outcome.error)).toBe(true);
  });
});

describe('/integrations/webhooks/$webhookId/edit guard and loader', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  const openEdit = (webhooksServed: boolean, webhookId: string) =>
    settle(
      beforeLoadOf(EditWebhookRoute)({
        context: { queryClient: queryClientWith(webhooksServed) },
        params: { webhookId },
      }),
    );

  it('opens on the listed webhook, titled by its host and never its URL', async () => {
    const outcome = await openEdit(true, 'ep_listed');

    expect(outcome).toHaveProperty('opened');
    const { webhook, getTitle } = (outcome as { opened: unknown }).opened as {
      webhook: typeof listed;
      getTitle: () => string;
    };
    expect(webhook).toEqual(listed);
    expect(getTitle()).toBe('hooks.slack.com');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('is not found where webhooks are not served, and reads nothing', async () => {
    const outcome = await openEdit(false, 'ep_listed');

    expect('error' in outcome && isNotFound(outcome.error)).toBe(true);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('fails with the API 404 for a webhook that does not exist', async () => {
    getMock.mockRejectedValue(
      new ApiError({
        status: 404,
        data: { status: 404, code: 'Svix.NotFound' },
      }),
    );

    const outcome = await openEdit(true, 'ep_unknown');

    expect('error' in outcome && isNotFoundError(outcome.error)).toBe(true);
    expect(getMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: { webhookId: 'ep_unknown' } }),
    );
  });
});

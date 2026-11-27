import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw/http';
import { beforeAll, describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { configureApiClient } from '@/lib/api/configure-api-client';
import { isNotFoundError } from '@/lib/errors';
import type { ApiWebhook } from '../../types';
import { webhookDetailQueryOptions } from '../webhook-detail-query-options';
import { loadWebhookForEdit } from '../webhook-edit-loader';
import { webhooksQueryOptions } from '../webhooks-query-options';

const listed: ApiWebhook = {
  id: 'ep_listed',
  url: 'https://api.example.com/listed',
  eventTypes: ['com.kaiten.customer.v1.created'],
};

const unlisted: ApiWebhook = {
  id: 'ep_unlisted',
  url: 'https://api.example.com/unlisted',
  eventTypes: ['com.kaiten.model.v1.created'],
  signingSecret: 'whsec_test',
};

function serveWebhooks() {
  const detailReads: string[] = [];

  server.use(
    http.get('*/webhooks', () => HttpResponse.json([listed])),
    http.get('*/webhooks/:webhookId', ({ params }) => {
      detailReads.push(String(params.webhookId));
      return params.webhookId === unlisted.id
        ? HttpResponse.json(unlisted)
        : HttpResponse.json(
            { status: 404, title: 'Not Found', code: 'Svix.NotFound' },
            { status: 404 },
          );
    }),
  );

  return detailReads;
}

// The app's own transport, so that a refusal reaches the caller as an ApiError.
beforeAll(() => configureApiClient());

describe('loadWebhookForEdit', () => {
  it('takes the webhook from the list, without reading it by id', async () => {
    const detailReads = serveWebhooks();
    const queryClient = new QueryClient();
    queryClient.setQueryData(webhooksQueryOptions.queryKey, [listed]);

    await expect(loadWebhookForEdit(queryClient, listed.id)).resolves.toEqual(listed);
    expect(detailReads).toEqual([]);
  });

  it('reads a webhook the list does not carry by id, even when a detail is cached', async () => {
    const detailReads = serveWebhooks();
    const queryClient = new QueryClient();
    queryClient.setQueryData(webhookDetailQueryOptions(unlisted.id).queryKey, {
      ...unlisted,
      url: 'https://stale.example.com',
    });

    await expect(loadWebhookForEdit(queryClient, unlisted.id)).resolves.toEqual(unlisted);
    expect(detailReads).toEqual([unlisted.id]);
  });

  it('rejects with the API 404 for a webhook that does not exist', async () => {
    serveWebhooks();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const outcome = await loadWebhookForEdit(queryClient, 'ep_unknown').catch(
      (error: unknown) => error,
    );

    expect(isNotFoundError(outcome)).toBe(true);
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { configureApiClient } from '@/lib/api/configure-api-client';
import type { WebhookMessageList } from '../../types';
import { useWebhookDeliveries } from '../use-webhook-deliveries';

const list: WebhookMessageList = {
  webhook: {
    id: 'ep_orders',
    url: 'https://api.example.com/hooks',
    createdAt: '2026-11-02T09:14:03Z',
    updatedAt: '2026-11-20T16:01:44Z',
  },
  messages: [
    {
      messageId: 'msg_2',
      eventType: 'com.kaiten.license.v1.updated',
      timestamp: '2026-11-26T08:40:01Z',
      status: 'pending',
      nextAttempt: '2026-11-26T09:10:03Z',
    },
    {
      messageId: 'msg_1',
      eventType: 'com.kaiten.instance.v1.created',
      timestamp: '2026-11-26T08:30:00Z',
      status: 'success',
    },
  ],
  summary: { total: 2, delivered: 1, failed: 0, pending: 1 },
  hasMore: false,
};

/** Serves the list; `failFrom` makes every read from that one on a 500. */
function serveList({ failFrom = Infinity }: { failFrom?: number } = {}) {
  const reads: string[] = [];
  server.use(
    http.get('*/webhooks/:webhookId/messages', ({ params, request }) => {
      reads.push(`${String(params.webhookId)}${new URL(request.url).search}`);
      return reads.length >= failFrom
        ? HttpResponse.json(
            { status: 500, title: 'Error', code: 'GetWebhookMessages.LookupFailed' },
            { status: 500 },
          )
        : HttpResponse.json(list);
    }),
  );
  return reads;
}

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const STRIP = { limit: 20, withAttempts: false };

// The app's own transport, so that a refusal reaches the hook as an ApiError.
beforeAll(() => configureApiClient());

describe('useWebhookDeliveries', () => {
  it('maps the list to deliveries, newest first, after a pending state', async () => {
    serveList();
    const { result } = renderHook(
      () => useWebhookDeliveries('ep_orders', STRIP),
      { wrapper: wrapper() },
    );

    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(
      result.current.data?.deliveries.map((delivery) => [
        delivery.key,
        delivery.status,
        delivery.nextAttempt,
      ]),
    ).toEqual([
      ['ep_orders:msg_2', 'pending', '2026-11-26T09:10:03Z'],
      ['ep_orders:msg_1', 'success', undefined],
    ]);
    expect(result.current.data?.summary).toEqual(list.summary);
    expect(result.current.data?.webhook.url).toBe(list.webhook.url);
  });

  it('shares one request between two readers of the same list', async () => {
    const reads = serveList();
    const Wrapper = wrapper();
    const { result } = renderHook(
      () => [
        useWebhookDeliveries('ep_orders', STRIP),
        useWebhookDeliveries('ep_orders', STRIP),
      ],
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current[1].data).toBeDefined());

    expect(reads).toEqual(['ep_orders?limit=20&withAttempts=false']);
  });

  it('reports an error after a single retry while there is nothing to show', async () => {
    const reads = serveList({ failFrom: 1 });
    const { result } = renderHook(
      () => useWebhookDeliveries('ep_orders', STRIP),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(reads).toHaveLength(2);
    expect(result.current.data).toBeUndefined();
  });

  it('keeps the last good list when a background refetch fails', async () => {
    const reads = serveList({ failFrom: 2 });
    const { result } = renderHook(
      () => useWebhookDeliveries('ep_orders', STRIP),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    await result.current.refetch();

    await waitFor(() => expect(reads).toHaveLength(3));
    expect(result.current.isError).toBe(false);
    expect(result.current.data?.deliveries).toHaveLength(2);
  });
});

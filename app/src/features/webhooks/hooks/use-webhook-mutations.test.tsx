import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  webhookHistoryQueryOptions,
  webhooksQueryOptions,
} from '../queries';
import type { ApiWebhook } from '../types';
import { useWebhookMutations } from './use-webhook-mutations';

const { createWebhookMock, deleteWebhookMock, toastErrorMock } = vi.hoisted(
  () => ({
    createWebhookMock: vi.fn(),
    deleteWebhookMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }),
);

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('../webhooks.api', () => ({
  createWebhook: createWebhookMock,
  deleteWebhook: deleteWebhookMock,
}));

vi.mock('../queries', () => ({
  webhooksQueryOptions: {
    queryKey: [{ _id: 'getWebhooks', baseURL: 'http://stale-base-url' }],
  },
  webhookHistoryQueryOptions: {
    queryKey: [{ _id: 'getWebhookHistory', baseURL: 'http://stale-base-url' }],
  },
  invalidateWebhookQueries: vi.fn(async (queryClient: QueryClient) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: webhooksQueryOptions.queryKey }),
      queryClient.invalidateQueries({
        queryKey: webhookHistoryQueryOptions.queryKey,
      }),
    ]);
  }),
}));

const existingWebhook: ApiWebhook = {
  createdAt: '2026-03-01T12:00:00Z',
  eventTypes: ['com.kaiten.customer.v1.created'],
  id: 'webhook-existing',
  updatedAt: '2026-03-01T12:00:00Z',
  url: 'https://example.com/existing',
};

const createdWebhook: ApiWebhook = {
  createdAt: '2026-03-02T12:00:00Z',
  eventTypes: ['com.kaiten.instance.v1.updated'],
  id: 'webhook-created',
  updatedAt: '2026-03-02T12:00:00Z',
  url: 'https://example.com/created',
};

describe('useWebhookMutations', () => {
  let queryClient: QueryClient;

  function createWrapper() {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    };
  }

  beforeEach(() => {
    toastErrorMock.mockReset();
    createWebhookMock.mockReset();
    deleteWebhookMock.mockReset();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });

    queryClient.setQueryData(webhooksQueryOptions.queryKey, [existingWebhook]);

    createWebhookMock.mockResolvedValue(createdWebhook);
    deleteWebhookMock.mockResolvedValue(undefined);
  });

  it('updates the webhooks cache immediately after creating a webhook', async () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useWebhookMutations(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.createWebhook.mutateAsync({
        body: {
          eventTypes: ['com.kaiten.instance.v1.updated'],
          url: 'https://example.com/created',
        },
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(webhooksQueryOptions.queryKey)).toEqual([
        createdWebhook,
        existingWebhook,
      ]);
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: webhooksQueryOptions.queryKey,
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: webhookHistoryQueryOptions.queryKey,
    });
  });

  it('removes the webhook from cache immediately after deleting it', async () => {
    queryClient.setQueryData(webhooksQueryOptions.queryKey, [
      existingWebhook,
      createdWebhook,
    ]);

    const { result } = renderHook(() => useWebhookMutations(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.deleteWebhook.mutateAsync({
        path: { webhookId: createdWebhook.id },
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(webhooksQueryOptions.queryKey)).toEqual([
        existingWebhook,
      ]);
    });
  });
});
